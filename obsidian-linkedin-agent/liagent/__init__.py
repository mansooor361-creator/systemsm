"""liagent - Obsidian-linked LinkedIn drafting agent with a human approval gate.

Generates post/comment/DM/profile drafts from an Obsidian vault into an
approval queue inside the vault. Nothing is ever published automatically:
there is no official API for posting to a personal LinkedIn profile, and
browser automation violates LinkedIn's User Agreement. Every draft is
humanized and scored locally, and a human approves before copy-pasting.
"""

__version__ = "0.1.0"
