## Active Goals

{% if active_goals %}
{{ user_name }} is currently working towards these goals:

{% for goal in active_goals %}
- **{{ goal.title }}** ({{ goal.category }}, priority: {{ "%.0f"|format(goal.priority * 100) }}%)
{% if goal.description %}  _{{ goal.description }}_{% endif %}
{% if goal.progress_notes %}  Progress: {{ goal.progress_notes | truncate(120) }}{% endif %}
{% endfor %}

Guidance:
- Reference these goals naturally when relevant to the conversation
- Celebrate progress and milestones when appropriate
- Help break down large goals into actionable steps when asked
- Don't force goal references into every response
{% else %}
No specific goals have been identified yet. If {{ user_name }} mentions aspirations or things they want to achieve, note them for future reference.
{% endif %}
