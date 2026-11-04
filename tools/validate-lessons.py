#!/usr/bin/env python3
"""Check authored lesson coverage and teaching structure against stable day IDs."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def words(text):
    return len(re.findall(r"\b[\wÀ-ÿ]+\b", text, re.UNICODE))


def require(condition, where, message):
    if not condition:
        raise ValueError(f"{where}: {message}")


def text(value, where, minimum=1):
    require(isinstance(value, str) and words(value) >= minimum, where, f"faltan al menos {minimum} palabras")
    require(not re.search(r"\bTBD\b|TODO:|lorem ipsum", value), where, "marcador de contenido pendiente")


def string_list(value, where, minimum=3):
    require(isinstance(value, list) and len(value) >= minimum, where, f"faltan {minimum} elementos")
    for index, item in enumerate(value):
        text(item, f"{where}[{index}]")


def visual(value, where):
    require(isinstance(value, dict), where, "falta el esquema visual")
    require(value.get("type") in ("flow", "compare", "layers", "cycle", "timeline"), where, "tipo visual no compatible")
    text(value.get("title"), where + ".title")
    text(value.get("caption"), where + ".caption", 4)
    items = value.get("items")
    require(isinstance(items, list) and 3 <= len(items) <= 6, where, "se requieren de tres a seis elementos visuales")
    for index, item in enumerate(items):
        require(isinstance(item, dict), where, "elemento visual inválido")
        text(item.get("label"), f"{where}.{index}.label")
        text(item.get("detail"), f"{where}.{index}.detail", 2)


def validate(selected=None):
    curriculum = json.loads((ROOT / "data/curriculum.json").read_text())["weeks"]
    summary = {"weeks": 0, "lessons": 0, "topics": 0, "visuals": 0, "workedExamples": 0, "checks": 0, "explanationWords": 0}
    seen_explanations, seen_questions = set(), set()
    for source in curriculum:
        number = source["number"]
        if selected and number not in selected:
            continue
        path = ROOT / f"data/lessons/week-{number:02}.json"
        require(path.exists(), path.name, "falta la clase semanal")
        week = json.loads(path.read_text())
        where = path.name
        require(week.get("version") == "2.0.0" and week.get("week") == number, where, "versión o semana inválida")
        require(week.get("title") == source["title"], where, "el título no coincide con el temario")
        text(week.get("overview"), where + ".overview", 60)
        string_list(week.get("objectives"), where + ".objectives")
        references = week.get("sources")
        require(isinstance(references, list) and len(references) >= 2, where, "faltan fuentes de consulta")
        source_ids = set()
        for reference in references:
            require(isinstance(reference, dict), where, "referencia inválida")
            key = reference.get("id")
            require(isinstance(key, str) and key not in source_ids, where, "ID de fuente duplicado o inválido")
            source_ids.add(key)
            text(reference.get("title"), where + ".source.title")
            url = urlparse(reference.get("url", ""))
            require(url.scheme == "https" and url.hostname and not url.username, where, "fuente HTTPS inválida")
        lessons = week.get("days")
        require(isinstance(lessons, list) and [d.get("dayId") for d in lessons] == [d["id"] for d in source["days"]], where, "se requieren los siete días en el orden original")
        for original, day in zip(source["days"], lessons):
            label = day["dayId"]
            require(day.get("title") == original["title"], label, "título de sesión alterado")
            text(day.get("lead"), label + ".lead", 3)
            sections = day.get("sections")
            require(isinstance(sections, list) and [s.get("topic") for s in sections] == original["topics"], label, "falta un tema o su orden no coincide")
            for section in sections:
                paragraphs = section.get("explanation")
                require(isinstance(paragraphs, list) and len(paragraphs) >= 2, label, "se requieren dos párrafos de explicación")
                for paragraph in paragraphs:
                    text(paragraph, label + ".explanation", 20)
                combined = " ".join(paragraphs)
                require(words(combined) >= 110, label, "explicación demasiado breve: menos de 110 palabras")
                normalized = re.sub(r"\s+", " ", combined).strip().casefold()
                require(normalized not in seen_explanations, label, "explicación duplicada")
                seen_explanations.add(normalized)
                text(section.get("analogy"), label + ".analogy", 5)
                string_list(section.get("keyPoints"), label + ".keyPoints")
                visual(section.get("visual"), label + ".visual")
                summary["topics"] += 1
                summary["visuals"] += 1
                summary["explanationWords"] += words(combined)
            example = day.get("workedExample")
            require(isinstance(example, dict), label, "falta el ejemplo resuelto")
            for field in ("title", "scenario", "result"):
                text(example.get(field), label + ".example." + field)
            steps = example.get("steps")
            require(isinstance(steps, list) and 3 <= len(steps) <= 5, label, "ejemplo sin tres a cinco pasos resueltos")
            for index, step in enumerate(steps):
                for field in ("action", "reason", "result"):
                    text(step.get(field), f"{label}.example.{index}.{field}", 2)
            visual(example.get("visual"), label + ".example.visual")
            practice = day.get("practice")
            require(isinstance(practice, dict), label, "falta la práctica")
            text(practice.get("task"), label + ".practice.task", 3)
            string_list(practice.get("steps"), label + ".practice.steps")
            text(practice.get("expected"), label + ".practice.expected", 3)
            if practice.get("console"):
                for field in ("language", "code", "output", "explanation"):
                    text(practice["console"].get(field), label + ".console." + field)
            check = day.get("check")
            require(isinstance(check, dict), label, "falta la pregunta de comprensión")
            text(check.get("question"), label + ".question", 3)
            question_key = check["question"].strip().casefold()
            require(question_key not in seen_questions, label, "pregunta de comprensión duplicada")
            seen_questions.add(question_key)
            options = check.get("options")
            require(isinstance(options, list) and len(options) >= 3, label, "faltan opciones de respuesta")
            ids = [option.get("id") for option in options]
            require(len(ids) == len(set(ids)) and check.get("correct") in ids, label, "solución de comprensión inválida")
            require(len({o.get("text", "").strip().casefold() for o in options}) == len(options), label, "opciones repetidas")
            for option in options:
                text(option.get("text"), label + ".option")
            text(check.get("explanation"), label + ".check.explanation", 6)
            mistakes = day.get("mistakes")
            require(isinstance(mistakes, list) and mistakes, label, "falta un error frecuente explicado")
            for mistake in mistakes:
                text(mistake.get("myth"), label + ".myth")
                text(mistake.get("correction"), label + ".correction", 5)
            string_list(day.get("recap"), label + ".recap")
            glossary = day.get("glossary")
            require(isinstance(glossary, list) and len(glossary) >= 2, label, "faltan términos de glosario")
            for term in glossary:
                text(term.get("term"), label + ".term")
                text(term.get("definition"), label + ".definition", 3)
            summary["lessons"] += 1
            summary["workedExamples"] += 1
            summary["visuals"] += 1
            summary["checks"] += 1
        summary["weeks"] += 1
    if not selected:
        require(summary["weeks"] == 52 and summary["lessons"] == 364 and summary["topics"] == 369 and summary["visuals"] == 733, "coverage", "cobertura incompleta")
    return {**summary, "checksStatus": "passed", "scope": "Cobertura y estructura didáctica; no acredita una revisión técnica independiente de cada frase."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--weeks", help="Rango opcional, por ejemplo 1-13 o 4")
    args = parser.parse_args()
    selected = None
    if args.weeks:
        bounds = [int(value) for value in args.weeks.split("-")]
        selected = set(range(bounds[0], bounds[-1] + 1))
    print(json.dumps(validate(selected), ensure_ascii=False, indent=2))
