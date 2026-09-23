# Repository Guidelines

## Project Structure & Module Organization

This repository is a planning and data workspace for the Cascais micromobility challenge. `docs/initial.md` contains the detailed proposal; `chalange.md` contains the short challenge brief. Source material lives in `datasets/`: bicycle trips and events, station and GBFS JSON, Waze traffic data, vehicle CSVs, and dated transit operation plans. `project/` is currently empty. There is no application source or test directory yet. Put new implementation code and its tests in clearly named subdirectories under `project/`; keep supplied data in `datasets/` and design notes in `docs/`.

## Build, Test, and Development Commands

There is no build system, dependency manifest, or automated test command in the repository. Before adding one, document its setup and commands here and in a project README. For now, use `git status --short` to review changed files and `git diff --check` to catch whitespace errors. Use `rg --files docs project` to locate working files without listing the large dataset tree.

## Coding Style & Naming Conventions

Follow the conventions of the language and formatter chosen for new code, and commit its configuration alongside the code. Use descriptive names that distinguish trip records, vehicle events, station geometry, and municipal collection cases. Keep source timestamps and time zones explicit. Preserve the names and schemas of supplied datasets; write derived outputs to separate, clearly named files instead of editing originals.

## Testing Guidelines

No test framework or coverage threshold is established. When code is added, include tests for data parsing, missing or duplicate identifiers, time-zone handling, and the station-area-plus-30-metre / 120-minute detection rule. Name tests to describe the behavior they verify and document the command that runs them. Treat historical sample data and simulated operational events as distinct inputs.

## Commit & Pull Request Guidelines

The short Git history includes `Add datasets and initial documentation` and `first commit`, so it does not establish a firm convention. Use concise, imperative commit subjects that describe the change. In pull requests, summarize the purpose, list validation performed, identify any changed data files or assumptions, and link the relevant issue when one exists. Include screenshots for changes to visual reports or interfaces.
