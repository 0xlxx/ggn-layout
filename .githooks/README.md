# Git hooks

Repo-local hooks are stored in `.githooks/`. Enable them once per clone:

```bash
git config core.hooksPath .githooks
```

`pre-commit` checks only staged text files. A file fails when its staged size is
greater than 20,000 bytes, i.e. more than 5,000 estimated tokens
(`bytes / 4`, rounded up).

Lock files, binary files, generated output and patterns listed in
`token-limit-ignore` are skipped. The error message includes concrete splitting
instructions.
