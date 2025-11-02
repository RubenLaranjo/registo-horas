import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL = 'https://xhfiyprscwihtvqftdvg.supabase.co'; // Substitua pelo seu Project URL do Supabase
    const SUPABASE_ANON_KEY = 'sb_publishable_1vu_WksLTKSEwBVqLEhN7w_8Zg0QTqo'; // Substitua pela sua anon public key do Supabase

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const googleLoginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const authSection = document.getElementById('auth-section');
    const appSection = document.getElementById('app-section');
    const userNameSpan = document.getElementById('user-name');

    const workEntryForm = document.getElementById('work-entry-form');
    const projectNameInput = document.getElementById('project-name');
    const workDateInput = document.getElementById('work-date');
    const hoursWorkedInput = document.getElementById('hours-worked');
    const historyDisplay = document.getElementById('history-display');

    // Set today's date as default for the date input
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months start at 0!
    const dd = String(today.getDate()).padStart(2, '0');
    workDateInput.value = `${yyyy}-${mm}-${dd}`;

    // Função para lidar com o login Google
    async function signInWithGoogle() {
        const { user, session, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
        });
        if (error) {
            console.error('Erro no login com Google:', error.message);
            alert('Erro no login com Google: ' + error.message);
        }
    }

    // Função para lidar com o logout
    async function signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Erro no logout:', error.message);
            alert('Erro no logout: ' + error.message);
        }
    }

    // Função para salvar o registo de horas no Supabase
    async function saveWorkEntry(event) {
        event.preventDefault();

        const user = (await supabase.auth.getSession()).data.session?.user;
        if (!user) {
            alert('Por favor, faça login para registar horas.');
            return;
        }

        const projectName = projectNameInput.value;
        const workDate = workDateInput.value;
        const hoursWorked = parseFloat(hoursWorkedInput.value);

        if (!projectName || !workDate || isNaN(hoursWorked)) {
            alert('Por favor, preencha todos os campos corretamente.');
            return;
        }

        const { data, error } = await supabase
            .from('work_entries')
            .insert([
                { user_id: user.id, project_name: projectName, work_date: workDate, hours_worked: hoursWorked }
            ]);

        if (error) {
            console.error('Erro ao registar horas:', error.message);
            alert('Erro ao registar horas: ' + error.message);
        } else {
            alert('Horas registadas com sucesso!');
            projectNameInput.value = ''; // Limpar campo do projeto
            hoursWorkedInput.value = ''; // Limpar campo das horas
            displayWorkHistory(); // Atualizar histórico
        }
    }

    // Função auxiliar para formatar a data para dd/mm/aaaa
    function formatDate(dateString) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }

    // Função para exibir o histórico de registos de horas
    async function displayWorkHistory() {
        const user = (await supabase.auth.getSession()).data.session?.user;
        if (!user) {
            historyDisplay.innerHTML = '<p>Faça login para ver o histórico.</p>';
            return;
        }

        const { data: entries, error } = await supabase
            .from('work_entries')
            .select('project_name, work_date, hours_worked')
            .eq('user_id', user.id)
            .order('work_date', { ascending: false });

        if (error) {
            console.error('Erro ao carregar histórico:', error.message);
            historyDisplay.innerHTML = '<p>Erro ao carregar histórico.</p>';
            return;
        }

        if (entries.length === 0) {
            historyDisplay.innerHTML = '<p>Nenhum registo de horas encontrado.</p>';
            return;
        }

        const monthNames = [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];

        // Agrupar por mês
        const groupedByMonth = entries.reduce((acc, entry) => {
            const date = new Date(entry.work_date);
            const monthIndex = date.getMonth();
            const year = date.getFullYear();
            const formattedMonthYear = `${monthNames[monthIndex]} / ${year}`;
            
            if (!acc[formattedMonthYear]) {
                acc[formattedMonthYear] = [];
            }
            acc[formattedMonthYear].push(entry);
            return acc;
        }, {});

        let html = '';
        for (const monthYear in groupedByMonth) {
            html += `<h4>${monthYear}</h4>`;
            html += '<ul>';
            groupedByMonth[monthYear].forEach(entry => {
                html += `<li>${formatDate(entry.work_date)}: ${entry.project_name} - ${entry.hours_worked} horas</li>`;
            });
            html += '</ul>';
        }
        historyDisplay.innerHTML = html;
    }

    // Função para atualizar a UI com base no estado de autenticação
    function updateUI(session) {
        if (session) {
            authSection.style.display = 'none';
            appSection.style.display = 'block';
            userNameSpan.textContent = session.user.user_metadata.full_name || session.user.email;
            displayWorkHistory(); // Carregar histórico após login
        } else {
            authSection.style.display = 'block';
            appSection.style.display = 'none';
            userNameSpan.textContent = '';
            historyDisplay.innerHTML = ''; // Limpar histórico ao fazer logout
        }
    }

    // Adicionar event listeners
    googleLoginBtn.addEventListener('click', signInWithGoogle);
    logoutBtn.addEventListener('click', signOut);
    workEntryForm.addEventListener('submit', saveWorkEntry);

    // Monitorar mudanças no estado de autenticação
    supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session);
        updateUI(session);
    });

    // Verificar o estado inicial de autenticação ao carregar a página
    async function getInitialSession() {
        const { data: { session } } = await supabase.auth.getSession();
        updateUI(session);
    }

    getInitialSession();
});