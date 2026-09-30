const http = require('http');
const nodemailer = require('nodemailer');

// ── Load .env ──
try {
    if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile();
    } else {
        require('dotenv').config();
    }
} catch (e) {
    console.warn('⚠ .env file not found — using environment variables from Render.');
}

const PORT = process.env.PORT || 3000;

// ── Allowed Origins (your cPanel domain) ──
const ALLOWED_ORIGINS = [
    'https://uyonm.com',
    'https://www.uyonm.com',
    'http://uyonm.com',
    'http://www.uyonm.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

function getCorsHeaders(req) {
    const origin = req.headers.origin || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
    };
}

// ── SMTP Transporter ──
let transporter = null;
function getTransporter() {
    if (transporter) return transporter;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = process.env.SMTP_SECURE !== 'false';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        return null;
    }

    transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });
    return transporter;
}

// ── Helper: Parse JSON body from POST request ──
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

// ── Helper: Send JSON response ──
function sendJson(res, statusCode, data, corsHeaders) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        ...corsHeaders
    });
    res.end(JSON.stringify(data));
}

// ── Email: Contact Form ──
async function handleContactForm(req, res, corsHeaders) {
    try {
        const { firstname, lastname, email, subject, message } = await parseBody(req);

        if (!firstname || !email || !subject || !message) {
            return sendJson(res, 400, { success: false, message: 'All fields are required.' }, corsHeaders);
        }

        const smtp = getTransporter();
        if (!smtp) {
            return sendJson(res, 500, { success: false, message: 'Email service not configured.' }, corsHeaders);
        }

        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
        const fromName = process.env.SMTP_FROM_NAME || 'UYNM Website';
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

        // 1. Send notification to admin
        await smtp.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: adminEmail,
            replyTo: `"${firstname} ${lastname || ''}" <${email}>`,
            subject: `[Contact Form] ${subject}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #263B5E, #374B6D); padding: 30px; text-align: center;">
                        <h1 style="color: #D4AF37; margin: 0; font-size: 22px;">New Contact Message</h1>
                        <p style="color: #94a3b8; margin: 8px 0 0;">United Youth Nigeria Movement</p>
                    </div>
                    <div style="padding: 30px; background: #ffffff;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 10px 0; color: #6B7280; width: 120px; vertical-align: top;"><strong>Name:</strong></td><td style="padding: 10px 0; color: #1F2937;">${firstname} ${lastname || ''}</td></tr>
                            <tr><td style="padding: 10px 0; color: #6B7280; vertical-align: top;"><strong>Email:</strong></td><td style="padding: 10px 0; color: #1F2937;"><a href="mailto:${email}" style="color: #263B5E;">${email}</a></td></tr>
                            <tr><td style="padding: 10px 0; color: #6B7280; vertical-align: top;"><strong>Subject:</strong></td><td style="padding: 10px 0; color: #1F2937;">${subject}</td></tr>
                        </table>
                        <div style="margin-top: 20px; padding: 20px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #D4AF37;">
                            <p style="margin: 0 0 8px; color: #6B7280; font-size: 13px;"><strong>Message:</strong></p>
                            <p style="margin: 0; color: #1F2937; line-height: 1.7; white-space: pre-wrap;">${message}</p>
                        </div>
                    </div>
                    <div style="padding: 15px 30px; background: #f3f4f6; text-align: center; color: #9ca3af; font-size: 12px;">
                        Sent via UYNM Website Contact Form
                    </div>
                </div>
            `
        });

        // 2. Send confirmation to sender
        await smtp.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: email,
            subject: `We've Received Your Message — ${fromName}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #263B5E, #374B6D); padding: 30px; text-align: center;">
                        <h1 style="color: #D4AF37; margin: 0; font-size: 22px;">Message Received ✓</h1>
                    </div>
                    <div style="padding: 30px; background: #ffffff;">
                        <p style="color: #1F2937; font-size: 16px; line-height: 1.7;">Dear <strong>${firstname}</strong>,</p>
                        <p style="color: #4B5563; line-height: 1.7;">Thank you for reaching out to the United Youth Nigeria Movement. We've received your message regarding <strong>"${subject}"</strong> and our team will respond within 24-48 hours.</p>
                        <p style="color: #4B5563; line-height: 1.7;">In the meantime, follow us on our social platforms for the latest updates on youth empowerment across Nigeria.</p>
                        <p style="color: #6B7280; margin-top: 25px; font-size: 14px;">— The UYNM Team</p>
                    </div>
                    <div style="padding: 15px 30px; background: #f3f4f6; text-align: center; color: #9ca3af; font-size: 12px;">
                        © 2026 United Youth Nigeria Movement
                    </div>
                </div>
            `
        });

        sendJson(res, 200, { success: true, message: 'Your message has been sent successfully! Check your email for a confirmation.' }, corsHeaders);

    } catch (err) {
        console.error('Contact form error:', err);
        sendJson(res, 500, { success: false, message: 'Failed to send message. Please try again later.' }, corsHeaders);
    }
}

// ── Email: Newsletter Subscribe ──
async function handleNewsletter(req, res, corsHeaders) {
    try {
        const { email } = await parseBody(req);

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return sendJson(res, 400, { success: false, message: 'Please enter a valid email address.' }, corsHeaders);
        }

        const smtp = getTransporter();
        if (!smtp) {
            return sendJson(res, 500, { success: false, message: 'Email service not configured.' }, corsHeaders);
        }

        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
        const fromName = process.env.SMTP_FROM_NAME || 'UYNM Website';
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

        // 1. Notify admin of new subscriber
        await smtp.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: adminEmail,
            subject: `[Newsletter] New Subscriber: ${email}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #263B5E, #374B6D); padding: 30px; text-align: center;">
                        <h1 style="color: #D4AF37; margin: 0; font-size: 22px;">📩 New Newsletter Subscriber</h1>
                    </div>
                    <div style="padding: 30px; background: #ffffff; text-align: center;">
                        <p style="color: #4B5563; font-size: 16px;">A new user has subscribed to the UYNM newsletter:</p>
                        <p style="color: #263B5E; font-size: 20px; font-weight: 600; margin: 20px 0;"><a href="mailto:${email}" style="color: #263B5E;">${email}</a></p>
                        <p style="color: #9ca3af; font-size: 13px;">Subscribed on ${new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</p>
                    </div>
                </div>
            `
        });

        // 2. Send welcome email to subscriber
        await smtp.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: email,
            subject: `Welcome to the UYNM Newsletter! 🎉`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #263B5E, #374B6D); padding: 40px; text-align: center;">
                        <h1 style="color: #D4AF37; margin: 0; font-size: 24px;">Welcome to UYNM! 🎉</h1>
                        <p style="color: #94a3b8; margin: 10px 0 0; font-size: 14px;">You're now part of the movement.</p>
                    </div>
                    <div style="padding: 30px; background: #ffffff;">
                        <p style="color: #1F2937; font-size: 16px; line-height: 1.7;">Thank you for subscribing to the <strong>United Youth Nigeria Movement</strong> newsletter!</p>
                        <p style="color: #4B5563; line-height: 1.7;">You'll receive updates on:</p>
                        <ul style="color: #4B5563; line-height: 2; padding-left: 20px;">
                            <li>Youth empowerment programs & bootcamps</li>
                            <li>Leadership development opportunities</li>
                            <li>Community impact projects across Nigeria</li>
                            <li>Events, conferences & volunteer openings</li>
                        </ul>
                        <div style="text-align: center; margin-top: 25px;">
                            <a href="https://uyonm.com" style="display: inline-block; padding: 12px 30px; background: #D4AF37; color: #16243d; text-decoration: none; border-radius: 6px; font-weight: 600;">Visit Our Website</a>
                        </div>
                    </div>
                    <div style="padding: 15px 30px; background: #f3f4f6; text-align: center; color: #9ca3af; font-size: 12px;">
                        © 2026 United Youth Nigeria Movement · Abuja, Nigeria
                    </div>
                </div>
            `
        });

        sendJson(res, 200, { success: true, message: 'You\'ve been subscribed! Check your email for a welcome message.' }, corsHeaders);

    } catch (err) {
        console.error('Newsletter error:', err);
        sendJson(res, 500, { success: false, message: 'Subscription failed. Please try again later.' }, corsHeaders);
    }
}

// ── Email: Get Involved / Registration Form ──
async function handleRegistration(req, res, corsHeaders) {
    try {
        const { fullname, email, phone, track, location, reason } = await parseBody(req);

        if (!fullname || !email || !track) {
            return sendJson(res, 400, { success: false, message: 'Please fill in all required fields.' }, corsHeaders);
        }

        const smtp = getTransporter();
        if (!smtp) {
            return sendJson(res, 500, { success: false, message: 'Email service not configured.' }, corsHeaders);
        }

        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
        const fromName = process.env.SMTP_FROM_NAME || 'UYNM Website';
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

        const trackLabels = {
            'volunteer': 'Volunteer',
            'partner': 'Partner / Organization',
            'member': 'Individual Member',
            'mentor': 'Mentor'
        };

        // 1. Admin notification
        await smtp.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: adminEmail,
            replyTo: `"${fullname}" <${email}>`,
            subject: `[New Registration] ${fullname} — ${trackLabels[track] || track}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #008751, #006b3f); padding: 30px; text-align: center;">
                        <h1 style="color: #fff; margin: 0; font-size: 22px;">🚀 New Member Registration</h1>
                    </div>
                    <div style="padding: 30px; background: #ffffff;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 10px 0; color: #6B7280; width: 140px; vertical-align: top;"><strong>Name:</strong></td><td style="padding: 10px 0; color: #1F2937;">${fullname}</td></tr>
                            <tr><td style="padding: 10px 0; color: #6B7280; vertical-align: top;"><strong>Email:</strong></td><td style="padding: 10px 0; color: #1F2937;"><a href="mailto:${email}">${email}</a></td></tr>
                            <tr><td style="padding: 10px 0; color: #6B7280; vertical-align: top;"><strong>Phone:</strong></td><td style="padding: 10px 0; color: #1F2937;">${phone || 'Not provided'}</td></tr>
                            <tr><td style="padding: 10px 0; color: #6B7280; vertical-align: top;"><strong>Track:</strong></td><td style="padding: 10px 0; color: #1F2937; font-weight: 600;">${trackLabels[track] || track}</td></tr>
                            <tr><td style="padding: 10px 0; color: #6B7280; vertical-align: top;"><strong>Location:</strong></td><td style="padding: 10px 0; color: #1F2937;">${location || 'Not provided'}</td></tr>
                        </table>
                        ${reason ? `
                        <div style="margin-top: 20px; padding: 20px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #008751;">
                            <p style="margin: 0 0 8px; color: #6B7280; font-size: 13px;"><strong>Why they want to join:</strong></p>
                            <p style="margin: 0; color: #1F2937; line-height: 1.7; white-space: pre-wrap;">${reason}</p>
                        </div>` : ''}
                    </div>
                </div>
            `
        });

        // 2. Confirmation to applicant
        await smtp.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: email,
            subject: `Welcome to the Movement, ${fullname.split(' ')[0]}! 🇳🇬`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #263B5E, #374B6D); padding: 40px; text-align: center;">
                        <h1 style="color: #D4AF37; margin: 0; font-size: 24px;">Registration Received! ✓</h1>
                    </div>
                    <div style="padding: 30px; background: #ffffff;">
                        <p style="color: #1F2937; font-size: 16px; line-height: 1.7;">Dear <strong>${fullname.split(' ')[0]}</strong>,</p>
                        <p style="color: #4B5563; line-height: 1.7;">Thank you for registering with the United Youth Nigeria Movement as a <strong>${trackLabels[track] || track}</strong>.</p>
                        <p style="color: #4B5563; line-height: 1.7;">Our team will review your application and reach out within <strong>48 hours</strong> with next steps.</p>
                        <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
                            <p style="color: #6B7280; margin: 0 0 5px; font-size: 13px;">Your selected track</p>
                            <p style="color: #263B5E; margin: 0; font-size: 20px; font-weight: 700;">${trackLabels[track] || track}</p>
                        </div>
                        <p style="color: #6B7280; margin-top: 25px; font-size: 14px;">— The UYNM Team</p>
                    </div>
                    <div style="padding: 15px 30px; background: #f3f4f6; text-align: center; color: #9ca3af; font-size: 12px;">
                        © 2026 United Youth Nigeria Movement
                    </div>
                </div>
            `
        });

        sendJson(res, 200, { success: true, message: 'Registration successful! Check your email for confirmation.' }, corsHeaders);

    } catch (err) {
        console.error('Registration error:', err);
        sendJson(res, 500, { success: false, message: 'Registration failed. Please try again later.' }, corsHeaders);
    }
}

// ── Main Server (API only) ──
const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const corsHeaders = getCorsHeaders(req);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    // Health check endpoint (for Render)
    if (req.method === 'GET' && (parsedUrl.pathname === '/' || parsedUrl.pathname === '/health')) {
        return sendJson(res, 200, { status: 'ok', service: 'UYNM API', timestamp: new Date().toISOString() }, corsHeaders);
    }

    // ── API Routes (POST) ──
    if (req.method === 'POST') {
        switch (parsedUrl.pathname) {
            case '/api/contact':
                return handleContactForm(req, res, corsHeaders);
            case '/api/newsletter':
                return handleNewsletter(req, res, corsHeaders);
            case '/api/register':
                return handleRegistration(req, res, corsHeaders);
            default:
                return sendJson(res, 404, { success: false, message: 'API endpoint not found.' }, corsHeaders);
        }
    }

    sendJson(res, 404, { success: false, message: 'Not found.' }, corsHeaders);
});

server.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  UYNM API Server running on port ${PORT}        ║`);
    console.log(`  ╚══════════════════════════════════════════════╝\n`);

    const smtp = getTransporter();
    if (smtp) {
        console.log('  ✅ SMTP email configured and ready');
        smtp.verify((err) => {
            if (err) {
                console.log('  ⚠  SMTP connection test failed:', err.message);
            } else {
                console.log('  ✅ SMTP connection verified successfully\n');
            }
        });
    } else {
        console.log('  ⚠  SMTP not configured — set environment variables in Render dashboard');
    }
});
