from typing import Literal
from pydantic import BaseModel

class Verdict(BaseModel):
    label: Literal["spam", "ham", "unclear"]
    escalate: bool

def classify_ticket(text: str) -> str:
    return "billing"
