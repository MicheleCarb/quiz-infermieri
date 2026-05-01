# -*- coding: utf-8 -*-
from __future__ import print_function

import io
import json
import os
import re
from collections import Counter


INPUT_FILE = "quiz_raw.txt"
OUTPUT_FILE = "questions.json"

SOURCE_NAME = "ASL BARI - CONCORSO UNICO REGIONALE INFERMIERI"

QUESTION_RE = re.compile(r"^(\d+)\)\s*(.*)")
ANSWER_RE = re.compile(r"^([A-Z])\)\s*(.*)")
ID_RE = re.compile(r"^ID:\s*(\d+)")


def normalize_spaces(text):
    """Compatta spazi multipli e rimuove spazi iniziali/finali."""
    return re.sub(r"\s+", " ", text).strip()


def is_ignored_line(line):
    """Riconosce intestazioni, numeri pagina, note e righe vuote da saltare."""
    cleaned = line.strip()

    if not cleaned:
        return True

    ignored_patterns = [
        r"^ASL BARI\s*-\s*CONCORSO UNICO REGIONALE INFERMIERI(?:\s+Pagina\s+\d+)?$",
        r"^Pagina\s+\d+$",
        r"^N\.B\.\s*Per facilitare la consultazione",
    ]

    return any(re.match(pattern, cleaned, re.IGNORECASE) for pattern in ignored_patterns)


def new_question(number, text):
    """Crea una domanda nel formato interno usato durante il parsing."""
    return {
        "number": int(number),
        "id": None,
        "question_parts": [text.strip()] if text.strip() else [],
        "answers": [],
        "correctAnswer": "A",
    }


def finalize_question(question):
    """Converte una domanda dal formato interno al formato JSON finale."""
    return {
        "number": question["number"],
        "id": question["id"],
        "question": normalize_spaces(" ".join(question["question_parts"])),
        "answers": [
            {
                "label": answer["label"],
                "text": normalize_spaces(" ".join(answer["parts"])),
            }
            for answer in question["answers"]
        ],
        "correctAnswer": "A",
    }


def append_unmatched_line(question, line):
    """Aggiunge una riga di continuazione alla domanda o all'ultima risposta."""
    if question["answers"]:
        question["answers"][-1]["parts"].append(line.strip())
    else:
        question["question_parts"].append(line.strip())


def parse_questions(input_path):
    questions = []
    current_question = None

    with io.open(input_path, "r", encoding="utf-8") as file:
        for line_number, raw_line in enumerate(file, start=1):
            line = raw_line.strip()

            if is_ignored_line(line):
                continue

            question_match = QUESTION_RE.match(line)
            answer_match = ANSWER_RE.match(line)
            id_match = ID_RE.match(line)

            if question_match:
                # Se una nuova domanda arriva prima dell'ID della precedente,
                # salviamo comunque la precedente e la segnaleremo nel report.
                if current_question is not None:
                    questions.append(finalize_question(current_question))

                current_question = new_question(
                    number=question_match.group(1),
                    text=question_match.group(2),
                )
                continue

            if answer_match and current_question is not None:
                current_question["answers"].append(
                    {
                        "label": answer_match.group(1),
                        "parts": [answer_match.group(2).strip()]
                        if answer_match.group(2).strip()
                        else [],
                    }
                )
                continue

            if id_match and current_question is not None:
                current_question["id"] = id_match.group(1)
                questions.append(finalize_question(current_question))
                current_question = None
                continue

            if current_question is not None:
                append_unmatched_line(current_question, line)
            else:
                # Riga fuori da una domanda: probabilmente testo editoriale o intestazione.
                continue

    if current_question is not None:
        questions.append(finalize_question(current_question))

    return questions


def find_number_gaps(questions):
    numbers = sorted(question["number"] for question in questions)
    if not numbers:
        return []

    found_numbers = set(numbers)
    return [
        number
        for number in range(numbers[0], numbers[-1] + 1)
        if number not in found_numbers
    ]


def build_validation_report(questions):
    ids = [question["id"] for question in questions if question["id"]]
    id_counts = Counter(ids)

    questions_without_id = [q for q in questions if not q["id"]]
    questions_without_a = [
        q for q in questions if "A" not in {answer["label"] for answer in q["answers"]}
    ]
    questions_with_less_than_3_answers = [
        q for q in questions if len(q["answers"]) < 3
    ]
    duplicated_ids = {
        question_id: count
        for question_id, count in id_counts.items()
        if count > 1
    }
    duplicate_questions_by_id = [
        q for q in questions if q["id"] in duplicated_ids
    ]
    number_gaps = find_number_gaps(questions)

    return {
        "total_questions": len(questions),
        "questions_without_id": questions_without_id,
        "questions_without_a": questions_without_a,
        "questions_with_less_than_3_answers": questions_with_less_than_3_answers,
        "duplicated_ids": duplicated_ids,
        "duplicate_questions_by_id": duplicate_questions_by_id,
        "number_gaps": number_gaps,
    }


def question_label(question):
    question_id = question["id"] or "mancante"
    return "domanda {} (ID: {})".format(question["number"], question_id)


def print_examples(title, items, formatter, limit=10):
    print("- {}: {}".format(title, len(items)))
    for item in items[:limit]:
        print("  * {}".format(formatter(item)))
    if len(items) > limit:
        print("  * ... altri {}".format(len(items) - limit))


def print_validation_report(report):
    print("\nReport di validazione")
    print("=" * 22)
    print("Totale domande trovate: {}".format(report["total_questions"]))

    print_examples(
        "Domande senza ID",
        report["questions_without_id"],
        question_label,
    )
    print_examples(
        "Domande senza risposta A",
        report["questions_without_a"],
        question_label,
    )
    print_examples(
        "Domande con meno di 3 risposte",
        report["questions_with_less_than_3_answers"],
        lambda q: "{} - risposte: {}".format(question_label(q), len(q["answers"])),
    )

    duplicated_ids = report["duplicated_ids"]
    print("- ID duplicati: {}".format(len(duplicated_ids)))
    for question_id, count in list(duplicated_ids.items())[:10]:
        print("  * ID {}: {} occorrenze".format(question_id, count))
    if len(duplicated_ids) > 10:
        print("  * ... altri {}".format(len(duplicated_ids) - 10))

    number_gaps = report["number_gaps"]
    print("- Salti nella numerazione: {}".format(len(number_gaps)))
    for number in number_gaps[:10]:
        print("  * manca la domanda {}".format(number))
    if len(number_gaps) > 10:
        print("  * ... altri {}".format(len(number_gaps) - 10))

    print_examples(
        "Domande duplicate per ID",
        report["duplicate_questions_by_id"],
        question_label,
    )


def save_json(questions, output_path):
    data = {
        "metadata": {
            "source": SOURCE_NAME,
            "correctAnswerRule": "La risposta corretta è sempre A",
            "totalQuestions": len(questions),
        },
        "questions": questions,
    }

    with io.open(output_path, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def main():
    if not os.path.exists(INPUT_FILE):
        raise SystemExit(
            "File non trovato: {}\n".format(INPUT_FILE) +
            "Metti quiz_raw.txt nella stessa cartella dello script e riprova."
        )

    questions = parse_questions(INPUT_FILE)
    save_json(questions, OUTPUT_FILE)

    report = build_validation_report(questions)
    print_validation_report(report)
    print("\nFile generato: {}".format(OUTPUT_FILE))


if __name__ == "__main__":
    main()
