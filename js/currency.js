// ONE place to change currency. Ships as Naira because that's what Paystack settles by default.
export const CUR = '₦'
export const CURRENCY_CODE = 'NGN'
export const fmt = (n) => `${CUR}${Number(n || 0).toLocaleString()}`
