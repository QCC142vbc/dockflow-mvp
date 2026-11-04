import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


_UN_NUMBER = re.compile(r"^UN\s?(\d{4})$", re.IGNORECASE)
_HAZARD_COMPONENT = r"(?:1\.[1-6]|2(?:\.[1-3])?|3|4\.[1-3]|5\.[1-2]|6\.[1-2]|7|8|9)"
_HAZARD_CLASS = re.compile(
    rf"^{_HAZARD_COMPONENT}(?:\s*/\s*{_HAZARD_COMPONENT})?"
    rf"(?:\s+\({_HAZARD_COMPONENT}(?:,\s*{_HAZARD_COMPONENT})*\))?$"
)


def normalize_un_number(value: str) -> str:
    match = _UN_NUMBER.fullmatch(value.strip())
    if not match:
        raise ValueError("UN number must contain UN followed by four digits.")
    return f"UN {match.group(1)}"


class ADRCatalogEntryInput(BaseModel):
    un_number: str = Field(min_length=6, max_length=7)
    product_name: str | None = Field(default=None, min_length=1, max_length=500)
    proper_shipping_name: str | None = Field(default=None, min_length=1, max_length=500)
    hazard_class: str = Field(min_length=1, max_length=20)
    classification_code: str | None = Field(default=None, max_length=50)
    packing_group: str | None = Field(default=None, max_length=10)
    label_codes: list[str] = Field(default_factory=list, max_length=10)
    special_provisions: list[str] = Field(default_factory=list, max_length=100)
    packing_instructions: list[str] = Field(default_factory=list, max_length=100)
    transport_category: str | None = Field(default=None, max_length=20)
    tunnel_restriction_code: str | None = Field(default=None, max_length=20)
    limited_quantity: str | None = Field(default=None, max_length=100)
    excepted_quantity: str | None = Field(default=None, max_length=100)
    regulatory_description: str | None = Field(default=None, max_length=4000)
    source: str = Field(min_length=1, max_length=300)
    source_url: str | None = Field(default=None, max_length=1000)
    reference_version: str = Field(min_length=1, max_length=50)

    @field_validator("un_number")
    @classmethod
    def validate_un_number(cls, value: str) -> str:
        return normalize_un_number(value)

    @field_validator("hazard_class")
    @classmethod
    def validate_hazard_class(cls, value: str) -> str:
        normalized = value.strip()
        if not _HAZARD_CLASS.fullmatch(normalized):
            raise ValueError("Hazard class must be a valid ADR class or division.")
        return normalized

    @field_validator("packing_group")
    @classmethod
    def validate_packing_group(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = value.strip().upper().replace("PG ", "")
        if normalized not in {"I", "II", "III", "N/A", "I/II*", "II/III*"}:
            raise ValueError("Packing group must match an ADR group or a source-marked conditional value.")
        return normalized

    @field_validator("label_codes", "special_provisions", "packing_instructions")
    @classmethod
    def normalize_codes(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(value.strip() for value in values if value.strip()))

    @field_validator("product_name", "proper_shipping_name", "source", "reference_version")
    @classmethod
    def trim_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("This field must not be blank.")
        return trimmed

    @model_validator(mode="after")
    def validate_display_name(self) -> "ADRCatalogEntryInput":
        if not self.product_name and not self.proper_shipping_name:
            raise ValueError("Provide a product name or proper shipping name.")
        return self


class ADRCatalogImportRequest(BaseModel):
    entries: list[ADRCatalogEntryInput] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def validate_unique_un_numbers(self) -> "ADRCatalogImportRequest":
        numbers = [entry.un_number for entry in self.entries]
        if len(set(numbers)) != len(numbers):
            raise ValueError("Import contains duplicate UN numbers.")
        return self


class ADRCatalogEntryResponse(ADRCatalogEntryInput):
    id: str

    model_config = ConfigDict(from_attributes=True)


class ADRCatalogImportResponse(BaseModel):
    created: int
    updated: int
    total: int
