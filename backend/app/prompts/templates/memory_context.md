## What You Remember

{{ memories }}


{% if conversation_history %}
## Recent Conversation (this session)

{% for turn in conversation_history %}
**{{ turn.role | title }}**: {{ turn.content }}
{% endfor %}
{% else %}
This is the start of the conversation.
{% endif %}
