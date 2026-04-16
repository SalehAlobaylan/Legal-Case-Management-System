# Case Linking Evaluation Workflow

This workflow evaluates retrieval quality with explicit labels (ground truth) instead of trusting rounded confidence percentages.

## 1) Prepare labels file

Copy `reports/case-link-eval-labels.example.json` to `reports/case-link-eval-labels.json` and edit it:

```json
[
  {
    "caseId": 16,
    "relevantRegulationIds": [68, 71]
  }
]
```

Each row means: for this `caseId`, these regulation IDs are considered relevant.

## 2) Run evaluation

```bash
npm run ai:evaluate:linking -- --labels=./reports/case-link-eval-labels.json --out-dir=./reports
```

## 3) Outputs

- `reports/case-link-evaluation-report.json`
- `reports/case-link-evaluation-per-case.csv`

Main metrics in summary:

- Recall@1 / Recall@3 / Recall@5
- Precision@1 / Precision@3 / Precision@5
- MRR
- nDCG@5
- Top5 score stddev (diagnostic for score compression)

## 4) Interpreting score compression

If `top5ScoreStddev` is near zero on many cases, scores are clustered too tightly.
This can happen even if ranking is acceptable, so always judge by retrieval metrics first.
