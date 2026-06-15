import 'dotenv/config';
import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY belum diisi di file .env');
}

const SYSTEM_PROMPT = `Kamu adalah PsyBot, asisten Psychological First Aid (PFA) yang berkomunikasi dalam Bahasa Indonesia.

Tugas kamu adalah:
1. LOOK: Deteksi tanda-tanda distres emosional (kesepian, stres, kecemasan, sedih) dari pesan pengguna.
2. LISTEN: Berikan respon empatik, non-judgmental, dan validating. Dengarkan perasaan pengguna tanpa menyela.
3. LINK: Tawarkan strategi coping yang sehat dan, jika diperlukan, sarankan mencari bantuan profesional (psikolog, konselor kampus, layanan kesehatan mental).

Aturan penting:
- Selalu gunakan Bahasa Indonesia yang santai, ramah, dan mudah dipahami oleh mahasiswa.
- Jangan memberikan diagnosis medis. Kamu hanyalah pendamping PFA.
- Jika pengguna menunjukkan tanda krisis (ingin menyakiti diri), segera sarankan menghubungi layanan darurat psikolog atau hotline.
- Jaga privasi. Jangan ceritakan percakapan pengguna ke orang lain.
- Jawab dengan singkat, jelas, dan berempati.
- Pertahankan konteks percakapan untuk memberikan respon yang releban.`;

const sessionStore = new Map();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geminiRequest(model, contents, retries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(url, {
        contents: contents,
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.7,
        },
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      if (status === 429 && i < retries - 1) {
        const waitTime = (i + 1) * 2000;
        console.log(`Rate limit, waiting ${waitTime}ms...`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
}

export async function sendMessage(userId, userMessage) {
  const model = 'gemini-2.5-flash';
  const key = `${userId}:history`;
  
  const MAX_INPUT_LENGTH = 3000;
  const truncatedMessage = userMessage.length > MAX_INPUT_LENGTH 
    ? userMessage.slice(0, MAX_INPUT_LENGTH) + '... (pesan dipotong)' 
    : userMessage;
  
  const history = sessionStore.get(key) || [];
  history.push({ role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\nPesan: ' + truncatedMessage }] });
  sessionStore.set(key, history);

  try {
    const data = await geminiRequest(model, history);
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log(`Gemini response via ${model}`);
    
    if (reply) {
      history.push({ role: 'model', parts: [{ text: reply }] });
      if (history.length > 20) {
        sessionStore.set(key, history.slice(-20));
      }
    }
    
    return reply || 'Maaf, tidak ada respons dari AI.';
  } catch (error) {
    console.warn(`Model ${model} gagal:`, error.response?.status || error.message);
    return 'Maaf, sistem AI sedang gangguan. Coba lagi sebentar ya.';
  }
}