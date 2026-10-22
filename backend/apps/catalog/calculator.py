from decimal import Decimal

def annuity_payment(amount: Decimal, annual_rate: Decimal, months: int) -> Decimal:
    r = annual_rate / 100 / 12
    if r == 0:
        return (amount / months).quantize(Decimal("0.01"))
    return (amount*r / (1 - (1 + r) ** -months)).quantize(Decimal("0.01"))