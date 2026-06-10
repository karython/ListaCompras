import React from 'react';
import { X, CreditCard, QrCode } from 'lucide-react';

export default function SubscriptionPlanModal({
  open,
  onClose,
  onSelectBillingType,
  billingType,
  onPay,
  paymentLink,
  paymentLoading,
  paymentError,
  paymentCreated,
  onConfirm,
  confirmLoading,
  confirmMessage,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Plano Anual</h2>
            <p className="text-sm text-gray-500">R$ 19,90 por ano para uso ilimitado.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-2xl bg-blue-50 p-4">
            <p className="text-sm text-blue-700 font-semibold">Plano Free</p>
            <ul className="text-sm text-gray-600 space-y-1 mt-2">
              <li>• Até 3 listas de compras</li>
              <li>• Até 3 compras finalizadas</li>
            </ul>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Liberado com assinatura</p>
            <p className="text-sm text-gray-600 mt-2">Ao pagar R$ 19,90 uma vez por ano, você libera o uso ilimitado do sistema.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onSelectBillingType('CREDIT_CARD')}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${billingType === 'CREDIT_CARD' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'}`}
            >
              <div className="flex items-center gap-2 justify-center">
                <CreditCard size={16} /> Cartão
              </div>
            </button>
            <button
              type="button"
              onClick={() => onSelectBillingType('PIX')}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${billingType === 'PIX' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'}`}
            >
              <div className="flex items-center gap-2 justify-center">
                <QrCode size={16} /> PIX
              </div>
            </button>
          </div>

          {!paymentCreated ? (
            <button
              type="button"
              onClick={onPay}
              disabled={paymentLoading}
              className="w-full rounded-2xl bg-blue-600 text-white py-3 text-sm font-semibold disabled:opacity-60"
            >
              {paymentLoading ? 'Gerando cobrança...' : 'Continuar para pagamento'}
            </button>
          ) : (
            <div className="space-y-3">
              {paymentLink ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">Link de pagamento criado</p>
                  <p className="mt-2 break-all"><a href={paymentLink} target="_blank" rel="noreferrer" className="text-blue-600 underline">Abrir link de pagamento</a></p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmLoading}
                className="w-full rounded-2xl bg-green-600 text-white py-3 text-sm font-semibold disabled:opacity-60"
              >
                {confirmLoading ? 'Verificando pagamento...' : 'Confirme o pagamento'}
              </button>
              {confirmMessage && (
                <p className="text-sm text-gray-600 text-center">{confirmMessage}</p>
              )}
            </div>
          )}

          {paymentError && (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {paymentError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
