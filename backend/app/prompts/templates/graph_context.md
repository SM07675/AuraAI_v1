{% if graph_facts and graph_facts|length > 0 %}
## KNOWLEDGE GRAPH RELATIONSHIPS
The following verified facts and entity relationships are known about the user:
{% for fact in graph_facts %}
- {{ fact }}
{% endfor %}
Use these connected facts naturally for personalization without saying "According to your knowledge graph".
{% endif %}
