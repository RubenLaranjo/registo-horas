import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';
import PDFDocument from 'pdfkit';

export default async (req, res) => {
    // 1. Configurar Supabase e SendGrid
    const supabaseUrl = process.env.SUPABASE_URL; // O URL do seu projeto Supabase
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL;

    if (!supabaseUrl || !supabaseServiceRoleKey || !sendgridApiKey || !senderEmail) {
        console.error('Erro: Variáveis de ambiente não configuradas corretamente.');
        return res.status(500).json({ error: 'Variáveis de ambiente não configuradas.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    sgMail.setApiKey(sendgridApiKey);

    try {
        // 2. Obter todos os utilizadores (apenas aqueles que têm registos de horas)
        // Para evitar enviar e-mails para utilizadores sem atividade.
        const { data: distinctUsers, error: distinctUsersError } = await supabase
            .from('work_entries')
            .select('user_id', { distinct: true });

        if (distinctUsersError) {
            console.error('Erro ao obter utilizadores distintos:', distinctUsersError);
            return res.status(500).json({ error: 'Erro ao obter utilizadores.' });
        }

        for (const userEntry of distinctUsers) {
            const userId = userEntry.user_id;

            // Obter o e-mail do utilizador
            const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);

            if (userError || !user) {
                console.error(`Erro ao obter dados do utilizador ${userId}:`, userError);
                continue; // Pular para o próximo utilizador
            }

            const userEmail = user.email;
            const userName = user.user_metadata?.full_name || user.email;

            // 3. Obter registos de horas do mês anterior para este utilizador
            const today = new Date();
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

            const firstDayFormatted = firstDayOfLastMonth.toISOString().split('T')[0];
            const lastDayFormatted = lastDayOfLastMonth.toISOString().split('T')[0];

            const { data: workEntries, error: workEntriesError } = await supabase
                .from('work_entries')
                .select('project_name, work_date, hours_worked')
                .eq('user_id', userId)
                .gte('work_date', firstDayFormatted)
                .lte('work_date', lastDayFormatted)
                .order('work_date', { ascending: true });

            if (workEntriesError) {
                console.error(`Erro ao obter registos de horas para ${userEmail}:`, workEntriesError);
                continue; // Pular para o próximo utilizador
            }

            if (workEntries.length === 0) {
                console.log(`Nenhum registo de horas para ${userEmail} no mês anterior. Pulando.`);
                continue; // Pular se não houver registos
            }

            // Definir monthName e year AQUI, antes de usar no doc.text
            const monthNames = [
                "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
            ];
            const monthName = monthNames[lastMonth.getMonth()];
            const year = lastMonth.getFullYear();

            // 4. Gerar Relatório PDF
            const doc = new PDFDocument();
            let pdfBuffer = [];
            doc.on('data', pdfBuffer.push.bind(pdfBuffer));
            doc.on('end', async () => {
                const attachment = Buffer.concat(pdfBuffer).toString('base64');

                const msg = {
                    to: userEmail,
                    from: senderEmail,
                    subject: `Relatório Mensal de Horas - ${monthName} de ${year}`,
                    html: `
                        <p>Olá ${userName},</p>
                        <p>Segue em anexo o seu relatório de horas trabalhadas para o mês de ${monthName} de ${year}.</p>
                        <p>Obrigado!</p>
                        <p>Seu Sistema de Registo de Horas</p>
                    `,
                    attachments: [
                        {
                            content: attachment,
                            filename: `Relatorio_Horas_${monthName}_${year}.pdf`,
                            type: 'application/pdf',
                            disposition: 'attachment',
                        },
                    ],
                };

                try {
                    console.log(`A tentar enviar e-mail para ${userEmail} com assunto: ${msg.subject}`); // NOVO LOG
                    await sgMail.send(msg);
                    console.log(`Relatório enviado para ${userEmail}`);
                } catch (emailError) {
                    console.error(`Erro ao enviar e-mail para ${userEmail}:`, emailError.response?.body || emailError.message || emailError); // LOG MELHORADO
                }
            });

            doc.fontSize(20).text(`Relatório Mensal de Horas - ${monthName} de ${year}`, { align: 'center' });
            doc.fontSize(12).text(`
Utilizador: ${userName} (${userEmail})
`, { align: 'left' });

            let totalHours = 0;
            doc.moveDown();
            doc.fontSize(14).text('Registos:', { underline: true });
            doc.moveDown();

            workEntries.forEach(entry => {
                const date = new Date(entry.work_date);
                const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
                doc.fontSize(12).text(`Data: ${formattedDate}, Projeto: ${entry.project_name}, Horas: ${entry.hours_worked}`);
                totalHours += entry.hours_worked;
            });

            doc.moveDown();
            doc.fontSize(14).text(`Total de Horas no Mês: ${totalHours.toFixed(2)}`, { align: 'right' });

            doc.end();
        }

        return res.status(200).json({ message: 'Processo de envio de relatórios iniciado.' });

    } catch (error) {
        console.error('Erro geral na função serverless:', error);
        return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
};
