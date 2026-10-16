from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, field_validator

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class Login(Strict):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class Register(Login):
    fullname: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)

class ProductInput(Strict):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    price: Decimal = Field(ge=0, le=9999999999, decimal_places=2)
    category: str = Field(min_length=1, max_length=100)
    stock: int = Field(ge=0, le=100000000)
    discount: Decimal = Field(default=Decimal('0'), ge=0, le=100, decimal_places=2)
    bgColor: str = Field(default='#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    panelColor: str = Field(default='#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    textColor: str = Field(default='#000000', pattern=r'^#[0-9a-fA-F]{6}$')

class Quantity(Strict):
    quantity: int = Field(default=1, ge=1, le=999)

class Shipping(Strict):
    fullName: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=5, max_length=30)
    address: str = Field(min_length=3, max_length=500)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    country: str = Field(default='India', min_length=2, max_length=100)
    zipCode: str = Field(min_length=2, max_length=20)

class Checkout(Strict):
    shippingAddress: Shipping
    paymentMethod: Literal['cod'] = 'cod'

class Status(Strict):
    status: Literal['confirmed', 'shipped', 'delivered', 'cancelled']


class LegacyAddress(Strict):
    street: str = Field(min_length=3, max_length=500)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    postalCode: str = Field(min_length=2, max_length=20)
    country: str = Field(min_length=2, max_length=100)
    contact: str = Field(min_length=5, max_length=30)

    @field_validator('contact', mode='before')
    @classmethod
    def contact_string(cls, value): return str(value)

class Profile(Strict):
    fullname: str | None = Field(default=None, min_length=1, max_length=120)
    picture: HttpUrl | None = None

class OwnerProfile(Profile):
    gstin: str | None = Field(default=None, pattern=r'^(|[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])$')
    discounts: str | None = Field(default=None, max_length=200)
