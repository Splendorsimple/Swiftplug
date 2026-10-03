import { supabase } from './supabaseClient.js'

export async function getApplicableDiscount(quantity, numberType) {
  const { data, error } = await supabase
    .from('discounts')
    .select('*')
    .eq('is_active', true)
    .lte('min_quantity', quantity)
    .or(`applies_to.eq.${numberType},applies_to.eq.both`)
    .order('min_quantity', { ascending: false })
    .limit(1)
  if (error || !data || !data.length) return null
  return data[0]
}

export function applyDiscount(total, discount) {
  if (!discount) return total
  if (discount.discount_type === 'percentage') return total * (1 - discount.discount_value / 100)
  return Math.max(0, total - discount.discount_value)
}
