import Mailgen from 'mailgen';

const mailGenerator = new Mailgen({
  theme: 'default',
  product: {
    name: 'BaatChat',
    link: process.env.FED_URL,
    logo: 'https://baatchat.online/logo.png', // replace with your hosted logo URL
    logoHeight: '40px',
    copyright: `© ${new Date().getFullYear()} BaatChat · baatchat.online · Made with ❤️ in India 🇮🇳`,
  },
});

/**
 * Generates HTML and plain text OTP verification email content.
 *
 * @param {string} name - Recipient's display name.
 * @param {string|number} otp - One-time password to include in the email.
 * @param {number} [expiresInMinutes=10] - Number of minutes before the OTP expires.
 * @returns {{html: string, text: string}} Rendered email content.
 */
const OTPMail = (name, otp, expiresInMinutes = 10) => {
  const email = {
    body: {
      name: name,
      intro: ['Welcome to <strong>BaatChat</strong> — Bolo. Suno. Connect karo. 🇮🇳', 'Use the OTP below to verify your account. This code is valid for <strong>' + expiresInMinutes + ' minutes</strong> only.'],
      action: {
        instructions: 'Enter this One-Time Password (OTP) on the verification screen:',
        button: {
          color: '#7C3AED', // BaatChat violet
          text: otp,
          link: `https://baatchat.online/auth/verify?otp=${otp}`, // deep link fallback
        },
      },
      table: {
        data: [
          {
            item: '🔐 OTP Code',
            description: `<strong style="font-size:24px;letter-spacing:6px;color:#7C3AED">${otp}</strong>`,
          },
          {
            item: '⏱ Expires in',
            description: `${expiresInMinutes} minutes`,
          },
          {
            item: '📱 Platform',
            description: 'BaatChat — Real-time chat & video calls',
          },
        ],
        columns: {
          customWidth: { item: '30%', description: '70%' },
          customAlignment: { item: 'left', description: 'left' },
        },
      },
      outro: ['If you did not create a BaatChat account, please ignore this email — no action is needed.', '<strong>Never share this OTP with anyone.</strong> BaatChat will never ask for your OTP.', '-- .... .. .-. . -- .   (decode this morse code 👀)'],
      signature: 'Team BaatChat',
    },
  };

  const htmlEmail = mailGenerator.generate(email);
  const textEmail = mailGenerator.generatePlaintext(email);

  return { html: htmlEmail, text: textEmail };
};

export default OTPMail;
