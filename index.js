import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { sendMessage as geminiReply } from './services/geminiService.js';
import 'dotenv/config';

const SESSION_DIR = './yusril';

let conn;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  conn = makeWASocket({
    auth: state,
  });

  conn.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.connectionClosed;
      console.log('Koneksi terputus, kode:', statusCode);
      if (shouldReconnect) {
        setTimeout(startBot, 5000);
      }
    } else if (connection === 'open') {
      console.log('\n✅ PsyBot terhubung!');
      console.log(`Bot ID: ${conn.user?.id}`);
      console.log('Status: SIAP menerima dan mengirim pesan\n');
    }
  });

  conn.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      if (m.key.fromMe || !m.message) continue;

      const from = m.key.remoteJid;
      const body = m.message.conversation || m.message.extendedTextMessage?.text || '';

      if (!body) continue;

      console.log(`\n📨 INCOMING MESSAGE`);
      console.log(`From: ${from}`);
      console.log(`Text: ${body.slice(0, 100)}${body.length > 100 ? '...' : ''}`);

      try {
        console.log(`\n🤖 GENERATING REPLY`);
        const reply = await geminiReply(from, body);

        if (!reply || !reply.trim()) {
          console.log('⚠️  Gemini response empty');
          continue;
        }

        console.log(`Reply: ${reply.slice(0, 100)}${reply.length > 100 ? '...' : ''}`);

        console.log(`\n📤 SENDING MESSAGE`);
        const MAX_LENGTH = 4000;
        const chunks = reply.length > MAX_LENGTH 
          ? reply.match(new RegExp(`.{1,${MAX_LENGTH}}`, 'g')) || [reply]
          : [reply];
        
        for (const chunk of chunks) {
          await conn.sendMessage(from, { text: chunk });
        }
        console.log(`✅ SUCCESS - Message delivered`);
      } catch (err) {
        console.error(`❌ ERROR: ${err.message}`);
      }

      console.log(`${'='.repeat(60)}\n`);
    }
  });

  conn.ev.on('creds.update', saveCreds);
}

startBot().catch(console.error);