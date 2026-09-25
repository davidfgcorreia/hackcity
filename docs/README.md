# Documentation index

Start with the [project README](../README.md) for the features, how to run it and screenshots.

## Current (describes the working prototype)

| Document | What it covers |
|---|---|
| [operations_requirements.md](operations_requirements.md) | What municipal staff need: the abandonment rule, the case lifecycle, the field app and the evidence. |
| [operations_architecture.md](operations_architecture.md) | How the operations stack implements it: detector, cases, missions, replay/live, OSRM routing. |
| [adr/0001-stack.md](adr/0001-stack.md) | Why Postgres + FastAPI + React/Vite. |
| [analytics_architecture.md](analytics_architecture.md) | The analysis database and pipeline, the Laya model, caching and measured findings. |
| [decision_map.md](decision_map.md) | User and technical guide to `/data`: every layer, drill-down, the Bird tab and station score, calculations. |
| [HANDOFF.md](HANDOFF.md) | The latest implementation state, what was verified, and dated change notes. |
| [NEXT_STEPS.md](NEXT_STEPS.md) | Pitch findings and the product backlog. |
| [prints/](prints/README.md) | Screenshot gallery (desktop and mobile). |

## Background and data (context for the decisions above)

| Document | What it covers |
|---|---|
| [initial.md](initial.md) | The product brief and working requirements. |
| [analytics_prediction_requirements.md](analytics_prediction_requirements.md) | The analytics specification and decision log. |
| [data_source_audit.md](data_source_audit.md) | What is in `datasets/`, what the GBFS feed returns, and other public sources. |
| [finalset_data_review.md](finalset_data_review.md) | Extraction and verified uses of the later `finalset/` delivery. |

## Planning archive (hackathon working files, kept for the record)

| Document | What it covers |
|---|---|
| [planning/start_questions.md](planning/start_questions.md) · [planning/responses.md](planning/responses.md) | The discovery questions and the team's answers. |
| [planning/TASKS.md](planning/TASKS.md) | The parallel task timeline used during the hackathon. |
| [planning/FRONTEND_LINKS.md](planning/FRONTEND_LINKS.md) | The early page list (superseded by the project README). |
