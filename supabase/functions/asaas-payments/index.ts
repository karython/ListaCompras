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

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, apikey, x-client-info, x-supabase-auth, x-supabase-realtime-info',
};

function withCors(headers: HeadersInit = {}) {
  return { ...CORS_HEADERS, ...headers };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCors({ 'content-type': 'application/json' }),
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

function serverErrorResponse(message = 'Erro interno do servidor') {
  return jsonResponse({ error: message }, 500);
}

async function fetchAsaas(path: string, options: RequestInit = {}) {
  // Try different header formats for Asaas authentication
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': ASAAS_API_KEY, // Try without Bearer prefix
    ...options.headers,
  };

  const keyPreview = ASAAS_API_KEY.length > 0 
    ? `${ASAAS_API_KEY.substring(0, 5)}...${ASAAS_API_KEY.substring(ASAAS_API_KEY.length - 5)}` 
    : 'EMPTY';
  
  console.log(`[fetchAsaas] Calling ${ASAAS_BASE_URL}${path} with method ${options.method || 'GET'}`);
  console.log(`[fetchAsaas] API Key: ${keyPreview} (length: ${ASAAS_API_KEY.length})`);
  console.log(`[fetchAsaas] Using header format: Authorization (direct, no Bearer)`);
  console.log(`[fetchAsaas] Headers:`, JSON.stringify({ 
    'Content-Type': headers['Content-Type'],
    'Accept': headers['Accept'],
    'Authorization': `${keyPreview}` 
  }));

  const response = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  console.log(`[fetchAsaas] Response status: ${response.status}, body length: ${text.length}`);
  console.log(`[fetchAsaas] Response headers content-type: ${response.headers.get('content-type')}`);
  
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse Asaas response JSON:', error, 'responseText:', text.substring(0, 200));
      data = { rawText: text };
    }
  }

  console.log(`[fetchAsaas] Response data:`, JSON.stringify(data).slice(0, 500));
  return { ok: response.ok, status: response.status, data, text };
}

async function findOrCreateCustomer(email: string, name: string, userId: string) {
  const query = `?email=${encodeURIComponent(email)}`;
  console.log(`[findOrCreateCustomer] Searching for customer with email: ${email}`);
  
  const search = await fetchAsaas(`/customers${query}`);
  console.log(`[findOrCreateCustomer] Search result - ok: ${search.ok}, data:`, search.data?.data ? `Found ${search.data.data.length} customers` : 'No data');
  
  if (search.ok && Array.isArray(search.data?.data) && search.data.data.length > 0) {
    console.log(`[findOrCreateCustomer] Customer found, ID: ${search.data.data[0].id}`);
    return search.data.data[0];
  }

  console.log(`[findOrCreateCustomer] Customer not found, creating new one...`);
  const payload = {
    name,
    email,
    externalReference: userId,
  };
  
  const create = await fetchAsaas('/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  console.log(`[findOrCreateCustomer] Create result - ok: ${create.ok}, status: ${create.status}`);
  console.log(`[findOrCreateCustomer] Create response:`, JSON.stringify(create.data).slice(0, 500));

  if (!create.ok) {
    const errorMessage = create.data?.errors?.[0]?.description || create.data?.message || create.text || 'Falha ao criar cliente Asaas';
    console.error(`[findOrCreateCustomer] Failed to create customer: ${errorMessage}`);
    throw new Error(errorMessage);
  }
  
  console.log(`[findOrCreateCustomer] Customer created successfully, ID: ${create.data.id}`);
  return create.data;
}

async function createPayment(requestBody: any) {
  const { userId, email, name, billingType } = requestBody;
  if (!userId || !email || !name || !billingType) {
    console.error('Missing required fields:', { userId: !!userId, email: !!email, name: !!name, billingType: !!billingType });
    return errorResponse('Parâmetros inválidos para criar pagamento', 400);
  }

  let customer;
  try {
    customer = await findOrCreateCustomer(email, name, userId);
    if (!customer || !customer.id) {
      console.error('Failed to get customer data:', customer);
      return errorResponse('Falha ao obter dados do cliente Asaas', 502);
    }
  } catch (customerError) {
    console.error('Error in findOrCreateCustomer:', customerError);
    const errorMsg = customerError instanceof Error ? customerError.message : String(customerError);
    return errorResponse(`Erro ao processar cliente: ${errorMsg}`, 502);
  }
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
    const errorMessage = asaasResponse.data?.errors?.[0]?.description || asaasResponse.data?.message || asaasResponse.text || 'Erro ao criar cobrança Asaas';
    return errorResponse(errorMessage, 502);
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
    return errorResponse(`Erro ao salvar pagamento: ${error.message}`, 502);
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
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return errorResponse('Método não autorizado', 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ASAAS_API_KEY) {
      const missingVars = [
        !SUPABASE_URL ? 'SUPABASE_URL' : null,
        !SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
        !ASAAS_API_KEY ? 'ASAAS_API_KEY' : null,
      ].filter(Boolean).join(', ');
      console.error('Missing environment variables:', missingVars);
      return serverErrorResponse(`Missing environment variables: ${missingVars}`);
    }

    const keyPreview = ASAAS_API_KEY.length > 0 
      ? `${ASAAS_API_KEY.substring(0, 5)}...${ASAAS_API_KEY.substring(ASAAS_API_KEY.length - 5)}` 
      : 'EMPTY';
    console.log(`[serve] Request received with API Key: ${keyPreview} (length: ${ASAAS_API_KEY.length})`);

    const text = await request.text();
    if (!text) {
      console.error('Empty request body');
      return errorResponse('Request body não pode estar vazio', 400);
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'text:', text);
      return errorResponse('Invalid JSON no request body', 400);
    }

    const action = body.action;

    if (action === 'create-payment') return await createPayment(body);
    if (action === 'confirm-payment') return await confirmPayment(body);
    if (action === 'webhook') return await webhook(request, body);

    if (body?.id || body?.object || body?.data) {
      return await webhook(request, body);
    }

    return errorResponse('Ação inválida', 400);
  } catch (error) {
    console.error('Unhandled error in edge function:', error);
    const message = error instanceof Error ? error.message : String(error);
    return serverErrorResponse(message);
  }
});
