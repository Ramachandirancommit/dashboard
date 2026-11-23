"""Rank modules with multinomial Naive Bayes using local labeled records."""
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

MODULES = json.loads((Path(__file__).resolve().parents[1] / "shared/modules.json").read_text())
TOKEN = re.compile(r"[^\W\d_]+", re.UNICODE)


def tokens(text):
    return TOKEN.findall(text.casefold())


def suggest(text, examples):
    counts = {
        module["slug"]: Counter(tokens(" ".join([
            module["name"], module["description"], *module["kinds"],
        ])))
        for module in MODULES
    }
    # Cap repeated tokens per example so one title cannot dominate the model.
    for example in examples:
        if example["module"] in counts:
            counts[example["module"]].update(set(tokens(example["title"])))

    vocabulary = set().union(*(words.keys() for words in counts.values()))
    terms = Counter(word for word in tokens(text) if word in vocabulary)
    if not terms:
        return {"suggestions": []}

    ranked = []
    for slug, words in counts.items():
        matched = sorted(terms.keys() & words.keys())
        if not matched:
            continue
        denominator = words.total() + len(vocabulary)
        score = sum(count * math.log((words[word] + 1) / denominator) for word, count in terms.items())
        ranked.append((score, slug, matched))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return {"suggestions": [{"module": slug, "matchedTerms": matched} for _, slug, matched in ranked[:3]]}


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    json.dump(suggest(payload["text"], payload["examples"]), sys.stdout)
