## Relevant Long-Term Context

{% if long_term_memories %}
Use these details only when they genuinely help with the user's current message:
{% for memory in long_term_memories %}
- {{ memory.key }}: {{ memory.value }}{% if memory.type %} ({{ memory.type }}){% endif %}
{% endfor %}
{% else %}
No relevant long-term details are available yet.
{% endif %}

Do not tell the user that these details came from stored memory or a database.
