## Conversation Continuity

{% if conversation_summary %}
### Current Session So Far

{{ conversation_summary }}
{% endif %}

{% if previous_session_context %}
### Relevant Earlier Chats

{% for summary in previous_session_context %}
- {{ summary }}
{% endfor %}
{% endif %}

Use this context to continue open threads and avoid repeating questions. Refer to
earlier details naturally, without claiming perfect recall or exposing internal storage.
