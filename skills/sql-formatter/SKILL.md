---
name: sql-formatter
description: Enforces the internal SQL style guide. Use whenever the user asks to format, review, or write SQL queries.
---

# SQL Style Guide Instructions

When writing or formatting SQL, you must act as a strict code linter and adhere to the following rules:

1. **Keyword Casing:** Use lower case for all SQL keywords and functions (`select`, `from`, `where`, `inner join`, `coalesce`, etc.).
2. **Commas:** Use a leading comma for all lists (select columns, group by parameters, etc.).
3. **Joins:** Write the join type and the `on` condition on the exact same line.
4. **Indentation:** Use 4 spaces for indentation. Indent column lists, conditions, and subqueries.
5. **Aliases:** Use short, meaningful aliases (e.g., `c` for `customers`, `o` for `orders`). Never use `AS` for table aliases.
6. **Trailing Whitespace:** Remove all trailing whitespace from lines.

## Examples

### Incorrect

```sql
SELECT
    id,
    customer_name,
    COALESCE(email, 'N/A') AS contact_email
FROM customers c
INNER JOIN orders o
    ON c.id = o.customer_id
WHERE o.status = 'active';
```

### Correct

```sql
select
    id
    , customer_name
    , coalesce(email, 'N/A') as contact_email
from customers c
inner join orders o on c.id = o.customer_id
where o.status = 'active'
;
```

## Execution

- If the user provides a raw SQL file, rewrite the file in place to match these standards without asking for confirmation.
- If the user asks to review SQL, list each violation with the line number and the rule that was broken, then provide the corrected version.
- If the user asks to write a new query, produce output that already conforms to these rules.
