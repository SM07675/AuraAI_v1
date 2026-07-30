"""
Prompt template loader.

Loads Jinja2 templates from the prompts/templates/ directory.
Supports hot-reload in development mode.
"""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, TemplateNotFound

from app.core.logging_config import get_logger

logger = get_logger(__name__)

_TEMPLATES_DIR = Path(__file__).parent / "templates"


def _create_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=False,
        keep_trailing_newline=True,
    )


# Module-level Jinja2 environment
_env = _create_env()


def render_template(template_name: str, **context) -> str:
    """Render a prompt template with the given context.

    Args:
        template_name: Filename inside templates/ (e.g., 'system_base.md').
        **context: Template variables.

    Returns:
        Rendered string.

    Raises:
        TemplateNotFound: If the template file does not exist.
    """
    try:
        template = _env.get_template(template_name)
        return template.render(**context).strip()
    except TemplateNotFound:
        logger.error("Prompt template not found", template=template_name)
        raise
    except Exception as exc:
        logger.error("Prompt template render failed", template=template_name, error=str(exc))
        raise


def list_templates() -> list[str]:
    """Return all available template names."""
    return [f.name for f in _TEMPLATES_DIR.glob("*.md")]
