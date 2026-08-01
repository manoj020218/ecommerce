# upi-payment-kit (frontend half)

Portable UPI checkout UX: tap-to-pay buttons on mobile, a scannable QR on
desktop. Self-contained — copy this whole folder into any React project.

**Only external dependency**: `qrcode` (npm).

## Usage

```jsx
import { UpiPaymentPanel } from "./upi-payment-kit/UpiPaymentPanel.jsx";

<UpiPaymentPanel
  upiId="yourstore@bank"        // payee VPA — omit/empty to render nothing (fallback to your own plain instructions)
  payeeName="Your Store Name"
  amount={grandTotal}
  orderNo={order.orderNo}
  note="Order payment"
  onDesktopShown={() => {/* e.g. fire a "please upload the screenshot" reminder */}}
/>
```

There is no browser API to detect which UPI apps are installed on a device —
that's an OS-level capability. `buildAppSpecificUpiLinks` (`upi-link.js`)
offers explicit buttons for the major apps (GPay/PhonePe/Paytm) plus a
generic `upi://` link; tapping the generic one lets the OS show its own
chooser when more than one app can handle it.

The counterpart backend piece — a dependency-injected "remind buyer to
upload their screenshot" WhatsApp sender — lives at
`backend/src/common/upi-payment-kit/whatsapp-reminder.js` in this repo. It
takes a `sendMessage(mobile, text)` function as a parameter and has no
direct dependency on any specific WhatsApp integration, so it's portable to
any Node project the same way.
