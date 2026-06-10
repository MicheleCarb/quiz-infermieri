# -*- coding: utf-8 -*-
from __future__ import print_function

import io
import json
import os
import random
import re


INPUT_FILE = "quiz_raw_pratica_esempio.txt"
OUTPUT_FILE = "questions-pratica-esempio.json"
PUBLIC_OUTPUT_FILE = os.path.join("..", "public", "data", OUTPUT_FILE)

SOURCE_NAME = "Prova Pratica Esempio"
ANSWER_COUNT = 3

STEP_RE = re.compile(r"^([A-Z])\.\s*(.*)")
NUMBERED_TOPIC_RE = re.compile(r"^\d+\)\s*(.*)")
NUMBERED_STEP_RE = re.compile(r"^(\d+)\.\s*(.*)")
COMMENT_RE = re.compile(r"^\s*#")
INSTRUCTION_RE = re.compile(r"^Identificare la sequenza corretta:?\s*$", re.IGNORECASE)


def normalize_spaces(text):
    return re.sub(r"\s+", " ", text).strip()


def get_seed(text):
    seed = 0
    for char in text:
        seed = ((seed * 31) + ord(char)) % 1000000007
    return seed


def shuffle_with_seed(items, seed):
    result = list(items)
    random.Random(seed).shuffle(result)
    return result


def is_ignored_line(line):
    stripped = line.strip()
    return not stripped or COMMENT_RE.match(line) or INSTRUCTION_RE.match(stripped)


def new_topic(title):
    return {
        "title": normalize_spaces(title),
        "steps": [],
    }


def parse_topics(input_path):
    topics = []
    current_topic = None

    with io.open(input_path, "r", encoding="utf-8") as file:
        for raw_line in file:
            if is_ignored_line(raw_line):
                continue

            stripped = raw_line.strip()
            step_match = STEP_RE.match(stripped)
            numbered_step_match = NUMBERED_STEP_RE.match(stripped)
            numbered_topic_match = NUMBERED_TOPIC_RE.match(stripped)

            if numbered_topic_match:
                if current_topic is not None:
                    topics.append(current_topic)

                current_topic = new_topic(numbered_topic_match.group(1))
                continue

            if step_match and current_topic is not None:
                current_topic["steps"].append(
                    {
                        "sourceLabel": step_match.group(1),
                        "text": normalize_spaces(step_match.group(2)),
                    }
                )
                continue

            if numbered_step_match and current_topic is not None:
                current_topic["steps"].append(
                    {
                        "sourceLabel": numbered_step_match.group(1),
                        "text": normalize_spaces(numbered_step_match.group(2)),
                    }
                )
                continue

            if current_topic is not None and current_topic["steps"] and raw_line[:1].isspace():
                current_topic["steps"][-1]["text"] = normalize_spaces(
                    current_topic["steps"][-1]["text"] + " " + stripped
                )
                continue

            if current_topic is not None and current_topic["steps"] and current_topic["steps"][-1]["sourceLabel"].isdigit():
                current_topic["steps"][-1]["text"] = normalize_spaces(
                    current_topic["steps"][-1]["text"] + " " + stripped
                )
                continue

            if current_topic is not None:
                topics.append(current_topic)

            current_topic = new_topic(stripped)

    if current_topic is not None:
        topics.append(current_topic)

    return topics


def format_sequence(numbers):
    return "-".join(str(number) for number in numbers)


def get_locked_positions(sequence_length):
    if sequence_length <= 4:
        return set()

    first_locked_count = 2 if sequence_length >= 6 else 1
    locked = set(range(first_locked_count))
    locked.add(sequence_length - 1)
    return locked


def get_middle_positions(sequence_length):
    locked = get_locked_positions(sequence_length)
    return [
        index
        for index in range(sequence_length)
        if index not in locked
    ]


def swap_adjacent_middle(sequence, rng):
    candidate = list(sequence)
    middle_positions = get_middle_positions(len(candidate))
    adjacent_pairs = [
        (left, left + 1)
        for left in middle_positions
        if left + 1 in middle_positions
    ]

    if not adjacent_pairs:
        return candidate

    left, right = rng.choice(adjacent_pairs)
    candidate[left], candidate[right] = candidate[right], candidate[left]
    return candidate


def move_middle_step(sequence, rng):
    candidate = list(sequence)
    middle_positions = get_middle_positions(len(candidate))

    if len(middle_positions) < 3:
        return swap_adjacent_middle(sequence, rng)

    from_index = rng.choice(middle_positions)
    possible_to_indexes = [
        index
        for index in middle_positions
        if index != from_index and abs(index - from_index) <= 2
    ]

    if not possible_to_indexes:
        return swap_adjacent_middle(sequence, rng)

    item = candidate.pop(from_index)
    to_index = rng.choice(possible_to_indexes)
    candidate.insert(to_index, item)
    return candidate


def double_near_miss(sequence, rng):
    candidate = swap_adjacent_middle(sequence, rng)
    return move_middle_step(candidate, rng)


def make_distractor_sequence(correct_sequence, seed):
    rng = random.Random(seed)

    if len(correct_sequence) < 2:
        return list(correct_sequence)

    builders = [swap_adjacent_middle]

    if len(correct_sequence) >= 5:
        builders.append(move_middle_step)

    if len(correct_sequence) >= 8:
        builders.append(double_near_miss)

    for _ in range(60):
        builder = rng.choice(builders)
        candidate = builder(correct_sequence, rng)
        if candidate != correct_sequence:
            return candidate

    return swap_adjacent_middle(correct_sequence, rng)


def build_answers(correct_sequence, question_seed):
    sequences = [correct_sequence]
    used = {tuple(correct_sequence)}
    attempt = 1

    while len(sequences) < ANSWER_COUNT:
        candidate = make_distractor_sequence(correct_sequence, question_seed + attempt)
        candidate_key = tuple(candidate)

        if candidate_key not in used:
            sequences.append(candidate)
            used.add(candidate_key)

        attempt += 1
        if attempt > 200:
            break

    if len(sequences) < ANSWER_COUNT:
        fallback = list(reversed(correct_sequence))
        if fallback != correct_sequence and tuple(fallback) not in used:
            sequences.append(fallback)
            used.add(tuple(fallback))

    ordered_sequences = shuffle_with_seed(sequences, question_seed + 2000)
    answers = []
    correct_label = "A"

    for index, sequence in enumerate(ordered_sequences):
        label = chr(ord("A") + index)
        if sequence == correct_sequence:
            correct_label = label
        answers.append(
            {
                "label": label,
                "text": format_sequence(sequence),
            }
        )

    return answers, correct_label


def build_question(topic, number):
    indexed_steps = list(enumerate(topic["steps"], start=1))
    question_seed = get_seed("{}-{}".format(number, topic["title"]))
    shuffled_steps = shuffle_with_seed(indexed_steps, question_seed)

    displayed_lines = []
    displayed_number_by_original_number = {}

    for display_number, item in enumerate(shuffled_steps, start=1):
        original_number, step = item
        displayed_number_by_original_number[original_number] = display_number
        displayed_lines.append("{}. {}".format(display_number, step["text"]))

    correct_sequence = [
        displayed_number_by_original_number[original_number]
        for original_number in range(1, len(topic["steps"]) + 1)
    ]
    answers, correct_label = build_answers(correct_sequence, question_seed)

    return {
        "number": number,
        "id": "pratica-esempio-{}".format(number),
        "question": "{}. Identificare la sequenza corretta.\n{}".format(
            topic["title"],
            "\n".join(displayed_lines),
        ),
        "procedureTopic": topic["title"],
        "steps": [
            {
                "number": index,
                "text": step["text"],
                "sourceLabel": step["sourceLabel"],
            }
            for index, step in enumerate(topic["steps"], start=1)
        ],
        "displayedSteps": [
            {
                "number": display_number,
                "originalNumber": original_number,
                "text": step["text"],
            }
            for display_number, (original_number, step)
            in enumerate(shuffled_steps, start=1)
        ],
        "correctSequence": correct_sequence,
        "answers": answers,
        "correctAnswer": correct_label,
    }


def build_questions(topics):
    return [
        build_question(topic, index)
        for index, topic in enumerate(topics, start=1)
        if topic["title"] and topic["steps"]
    ]


def save_json(questions, output_path):
    data = {
        "metadata": {
            "source": SOURCE_NAME,
            "questionType": "sequenza-procedura",
            "correctAnswerRule": "La sequenza corretta segue l'ordine originale dei passaggi nel file raw",
            "totalQuestions": len(questions),
        },
        "questions": questions,
    }

    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    with io.open(output_path, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def print_report(topics, questions):
    print("Prova Pratica Esempio")
    print("=====================")
    print("Procedure trovate: {}".format(len(topics)))
    print("Domande generate: {}".format(len(questions)))

    without_steps = [topic["title"] for topic in topics if not topic["steps"]]
    print("Procedure senza passaggi: {}".format(len(without_steps)))
    for title in without_steps[:10]:
        print("  * {}".format(title))


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_path = os.path.join(script_dir, INPUT_FILE)
    output_path = os.path.join(script_dir, OUTPUT_FILE)
    public_output_path = os.path.normpath(os.path.join(script_dir, PUBLIC_OUTPUT_FILE))

    if not os.path.exists(input_path):
        raise SystemExit("File non trovato: {}".format(input_path))

    topics = parse_topics(input_path)
    questions = build_questions(topics)
    save_json(questions, output_path)
    save_json(questions, public_output_path)
    print_report(topics, questions)


if __name__ == "__main__":
    main()
