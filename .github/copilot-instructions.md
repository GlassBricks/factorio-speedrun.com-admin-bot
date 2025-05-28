## About

This is a node typescript project, for a discord bot.
Exported classes in /src/commands are automatically loaded by the framework.
These only include commands, events, and listeners.

For persistent information, there is a database using sqlite and sequelize.

## Typescript

Use strict types everywhere. Do not use `any` type.
Prefer const over let.

## Code style

Do not deeply nest code blocks. Instead, do one of the following:
Invert guard logic to return early, instead of nesting the main code inside an `if` block.
Extract a function if the code is too long or complex.

Prefer self documenting code, through naming and structure, over comments.
Group related functions together.
Prefer short functions that do one thing.

Prefer functional programming style where practical.

## Writing new code

Add additional imports for types when needed.
If needed, write new code as if additional symbols are already imported, even if they are not yet. 
If code is too deeply nested, introduce a function call to a descriptive function, even if the function does not _yet_
exist.
