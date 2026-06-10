import { supabase } from '../supabaseClient';

export async function fetchSubscription(userId) {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function createAsaasPayment({ userId, email, name, billingType }) {
  const payload = {
    action: 'create-payment',
    userId,
    email,
    name,
    billingType,
  };

  const { data, error } = await supabase.functions.invoke('asaas-payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (error) throw error;
  return typeof data === 'string' ? JSON.parse(data || '{}') : data;
}

export async function confirmAsaasPayment({ paymentId, userId }) {
  const payload = {
    action: 'confirm-payment',
    paymentId,
    userId,
  };

  const { data, error } = await supabase.functions.invoke('asaas-payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (error) throw error;
  return typeof data === 'string' ? JSON.parse(data || '{}') : data;
}
