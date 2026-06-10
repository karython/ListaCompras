import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY') || '';
const ASAAS_WEBHOOK_SECRET = Deno.env.get('ASAAS_WEBHOOK_SECRET') || '';
const ASAAS_BASE_URL = 'https://www.asaas.com/api/v3';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ASAAS_API_KEY) {
  console.error('Missing required environment variables for Asaas payment function.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

async function fetchAsaas(path: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${ASAAS_API_KEY}`,
    ...options.headers,
  };

  const response = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json();
  return { ok: response.ok, data };
}

async function findOrCreateCustomer(email: string, name: string, userId: string) {
  const query = `?email=${encodeURIComponent(email)}`;
  const search = await fetchAsaas(`/customers${query}`);
  if (search.ok && Array.isArray(search.data?.data) && search.data.data.length > 0) {
    return search.data.data[0];
  }

  const payload = {
    name,
    email,
    externalReference: userId,
  };
  const create = await fetchAsaas('/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!create.ok) {
    throw new Error(create.data?.errors?.[0]?.description || 'Falha ao criar cliente Asaas');
  }
  return create.data;
}

async function createPayment(requestBody: any) {
  const { userId, email, name, billingType } = requestBody;
  if (!userId || !email || !name || !billingType) {
    return errorResponse('Parâmetros inválidos para criar pagamento', 400);
  }

  const customer = await findOrCreateCustomer(email, name, userId);
  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const payload: any = {
    customer: customer.id,
    billingType,
    dueDate,
    value: 19.9,
    description: 'Assinatura anual Lista de Compras',
    externalReference: userId,
    currency: 'BRL',
  };
  if (billingType === 'PIX') {
    payload.pixExpirationDate = dueDate;
  }

  const asaasResponse = await fetchAsaas('/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!asaasResponse.ok) {
    return errorResponse(asaasResponse.data?.errors?.[0]?.description || 'Erro ao criar cobrança Asaas', 502);
  }

  const payment = asaasResponse.data;
  const { error } = await supabase.from('subscription_payments').insert({
    user_id: userId,
    asaas_payment_id: payment.id,
    billing_type: billingType,
    amount: payment.value,
    currency: payment.currency || 'BRL',
    status: payment.status,
    invoice_url: payment.invoiceUrl || payment.bankSlipUrl || payment.pdfLink || null,
    raw_response: payment,
  });

  if (error) {
    console.error('Erro ao salvar pagamento no Supabase:', error);
  }

  return jsonResponse({ payment });
}

function isPaidStatus(status: string) {
  return ['CONFIRMED', 'RECEIVED', 'PAID'].includes(status.toUpperCase());
}

async function updateSubscriptionOnPayment(userId: string, payment: any) {
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const { error: upsertError } = await supabase.from('user_subscriptions').upsert({
    user_id: userId,
    plan: 'annual',
    status: 'active',
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (upsertError) {
    console.error('Falha ao atualizar assinatura:', upsertError);
  }

  const { error: paymentUpdateError } = await supabase.from('subscription_payments').update({
    status: 'CONFIRMED',
    paid_at: payment.paymentDate || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    raw_response: payment,
  }).eq('asaas_payment_id', payment.id);

  if (paymentUpdateError) {
    console.error('Falha ao atualizar registro de pagamento:', paymentUpdateError);
  }
}

async function confirmPayment(requestBody: any) {
  const { userId, paymentId } = requestBody;
  if (!userId || !paymentId) {
    return errorResponse('Parâmetros inválidos para confirmar pagamento', 400);
  }

  const asaasResponse = await fetchAsaas(`/payments/${encodeURIComponent(paymentId)}`);
  if (!asaasResponse.ok) {
    return errorResponse('Não foi possível consultar o pagamento no Asaas', 502);
  }

  const payment = asaasResponse.data;
  const paid = isPaidStatus(payment.status);

  const { error } = await supabase.from('subscription_payments').upsert({
    user_id: userId,
    asaas_payment_id: payment.id,
    billing_type: payment.billingType || 'CREDIT_CARD',
    amount: payment.value,
    currency: payment.currency || 'BRL',
    status: payment.status,
    paid_at: payment.paymentDate || null,
    invoice_url: payment.invoiceUrl || payment.bankSlipUrl || payment.pdfLink || null,
    updated_at: new Date().toISOString(),
    raw_response: payment,
  }, { onConflict: 'asaas_payment_id' });

  if (error) {
    console.error('Erro ao atualizar payment no supabase:', error);
  }

  if (paid) {
    await updateSubscriptionOnPayment(userId, payment);
    return jsonResponse({ success: true, payment, message: 'Pagamento confirmado. Assinatura ativa por 1 ano.' });
  }

  return jsonResponse({ success: false, payment, message: 'Pagamento ainda não confirmado. Verifique novamente após alguns minutos.' });
}

async function verifyWebhookSignature(rawBody: string, signature: string) {
  if (!ASAAS_WEBHOOK_SECRET) return true;
  if (!signature) return false;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(ASAAS_WEBHOOK_SECRET);
  const bodyData = encoder.encode(rawBody);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const sigHex = signature.replace(/^hex:/i, '');
  const signatureBuffer = new Uint8Array(sigHex.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);
  return crypto.subtle.verify('HMAC', cryptoKey, signatureBuffer, bodyData);
}

async function webhook(request: Request, parsedBody?: any) {
  const rawBody = await request.text();
  const body = parsedBody || (rawBody ? JSON.parse(rawBody) : {});
  const signature = request.headers.get('x-asaas-signature') || request.headers.get('X-Hub-Signature');

  if (ASAAS_WEBHOOK_SECRET && !signature) {
    return errorResponse('Assinatura do webhook ausente', 401);
  }

  if (ASAAS_WEBHOOK_SECRET) {
    const valid = await verifyWebhookSignature(rawBody, signature || '');
    if (!valid) {
      return errorResponse('Assinatura do webhook inválida', 401);
    }
  }

  const payment = body?.object || body?.data || body;
  if (!payment?.id) {
    return errorResponse('Pagamento inválido no webhook', 400);
  }

  const paid = isPaidStatus(payment.status);
  if (paid) {
    await updateSubscriptionOnPayment(payment.externalReference || payment.customer, payment);
  }

  await supabase.from('subscription_payments').upsert({
    user_id: payment.externalReference || payment.customer,
    asaas_payment_id: payment.id,
    billing_type: payment.billingType || 'CREDIT_CARD',
    amount: payment.value,
    currency: payment.currency || 'BRL',
    status: payment.status,
    paid_at: payment.paymentDate || null,
    invoice_url: payment.invoiceUrl || payment.bankSlipUrl || payment.pdfLink || null,
    updated_at: new Date().toISOString(),
    raw_response: payment,
  }, { onConflict: 'asaas_payment_id' });

  return jsonResponse({ success: true });
}

serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return errorResponse('Método não autorizado', 405);
  }

  const text = await request.text();
  const body = text ? JSON.parse(text) : {};
  const action = body.action;

  if (action === 'create-payment') return await createPayment(body);
  if (action === 'confirm-payment') return await confirmPayment(body);
  if (action === 'webhook') return await webhook(request, body);

  if (body?.id || body?.object || body?.data) {
    return await webhook(request, body);
  }

  return errorResponse('Ação inválida', 400);
});
