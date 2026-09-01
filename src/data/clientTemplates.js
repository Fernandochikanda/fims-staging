// ============================================================
// src/data/clientTemplates.js
// ============================================================
// This file exports all client-specific inspection templates.
// Each template is an object with a "sections" array.
// The BASE_TEMPLATE is used by most clients; unique clients
// have their own custom templates with additional sections.

// ---------- BASE TEMPLATE (used by ~25 clients) ----------
const BASE_TEMPLATE = {
  sections: [
    {
      id: "pessoal_limpezas",
      name: "PESSOAL DE LIMPEZAS",
      items: [
        { id: "pl_1", text: "Todos os funcionários tem de ter uniforme limpo e engomado?", max: 5 },
        { id: "pl_2", text: "Todos os funcionários tem de estar asseiados e profissionais?", max: 5 },
        { id: "pl_3", text: "Eles são treinados adequadamente em suas tarefas regularmente?", max: 5 },
        { id: "pl_4", text: "Estão seguindo as regras de segurança?", max: 5 },
        { id: "pl_5", text: "O local de equipamentos e material está limpo e organizado?", max: 5 },
        { id: "pl_6", text: "A Administração está feliz com o desempenho das funções?", max: 5 },
      ]
    },
    {
      id: "gabinetes",
      name: "GABINETES",
      items: [
        { id: "g_1", text: "O tapete é aspirado regularmente?", max: 5 },
        { id: "g_2", text: "Os cantos e bordas são aspirados regularmente?", max: 5 },
        { id: "g_3", text: "Existem muitos pontos e manchas no tapete?", max: 5 },
        { id: "g_4", text: "O chão é limpo e lavado regularmente?", max: 5 },
        { id: "g_5", text: "Argamassa limpa?", max: 5 },
        { id: "g_6", text: "Rodapés limpos, sem poeira e manchas?", max: 5 },
        { id: "g_7", text: "As bordas e cantos estão livres de teias e poeira?", max: 5 },
        { id: "g_8", text: "A parede está livre de manchas, pichações, etc.?", max: 5 },
        { id: "g_9", text: "Portas limpas e livres de impressões digitais e manchas?", max: 5 },
        { id: "g_10", text: "O tampo das mesas está livre de poeira?", max: 5 },
        { id: "g_11", text: "Todas as cadeiras estão livres de pó?", max: 5 },
        { id: "g_12", text: "Os recipientes de lixo são esvaziados regularmente?", max: 5 },
        { id: "g_13", text: "Todas as janelas estão livres de manchas e impressões digitais?", max: 5 },
        { id: "g_14", text: "Todas as bordas estão livres de poeira e limpas?", max: 5 },
      ]
    },
    {
      id: "copas",
      name: "COPAS / COPA",
      items: [
        { id: "c_1", text: "O chão é limpo e lavado regularmente?", max: 5 },
        { id: "c_2", text: "Rodapés limpos, sem poeira e manchas?", max: 5 },
        { id: "c_3", text: "A geleira é limpa dentro e fora regularmente?", max: 5 },
        { id: "c_4", text: "A chaleira é limpa regularmente?", max: 5 },
        { id: "c_5", text: "O microondas é limpo regularmente?", max: 5 },
        { id: "c_6", text: "O lavatório e torneira são limpos regularmente?", max: 5 },
        { id: "c_7", text: "Os armários estão limpos e livres de migalhas?", max: 5 },
        { id: "c_8", text: "Toda a loiça é lavada e arrumada devidamente?", max: 5 },
      ]
    },
    {
      id: "casas_banho",
      name: "CASAS DE BANHO",
      items: [
        { id: "b_1", text: "Todos os dispensadores estão limpos e devidamente recarregados?", max: 5 },
        { id: "b_2", text: "Todos os dispensadores estão em boas condições?", max: 5 },
        { id: "b_3", text: "Os cantos e bordas são varridos ou aspirados completamente?", max: 5 },
        { id: "b_4", text: "Todas as pias estão livres de manchas de água e limpas?", max: 5 },
        { id: "b_5", text: "As peças de aço inoxidável são polidas e livres de manchas?", max: 5 },
        { id: "b_6", text: "Todos os banheiros/urinóis estão livres de manchas?", max: 5 },
        { id: "b_7", text: "Existe problema de mau cheiro?", max: 5 },
        { id: "b_8", text: "O chão é limpo diariamente com limpador desinfetante?", max: 5 },
        { id: "b_9", text: "Todas as latas de lixo são esvaziadas e limpas regularmente?", max: 5 },
      ]
    }
  ]
};

// 1. BIOFUND
const BIOFUND_TEMPLATE = {
  sections: [
    { ...BASE_TEMPLATE.sections[0] },
    {
      id: "exterior",
      name: "EXTERIOR",
      items: [
        { id: "ex_1", text: "As manchas de óleo de viaturas são limpas regularmente?", max: 5 },
        { id: "ex_2", text: "Os detritos, folhas e lixo são varridos regularmente?", max: 5 },
        { id: "ex_3", text: "O estacionamento é livre de escritas, autocolantes e teias?", max: 5 },
        { id: "ex_4", text: "Paredes exteriores livres de poeira e teias de aranha?", max: 5 },
        { id: "ex_5", text: "Todas as janelas exteriores estão limpas, sem manchas?", max: 5 },
        { id: "ex_6", text: "As janelas estão livres de manchas de água seca?", max: 5 },
        { id: "ex_7", text: "Os trilhos estão livres de poeira e sujeira?", max: 5 },
        { id: "ex_8", text: "Os passeios e passedeiras são lavados a pressão regularmente?", max: 5 },
        { id: "ex_9", text: "Os passeios pedestres estão limpos, sem detritos e lixo?", max: 5 },
        { id: "ex_10", text: "As paredes das escadas estão limpas e sem manchas?", max: 5 },
        { id: "ex_11", text: "As escadas estão livres de poeira, detritos e teias de aranha?", max: 5 },
        { id: "ex_12", text: "Canal limpo e desbloqueado?", max: 5 },
        { id: "ex_13", text: "Livre de odor?", max: 5 },
        { id: "ex_14", text: "Descarga de águas feito no local próprio?", max: 5 },
      ]
    },
    {
      id: "gabinetes",
      name: "GABINETES R/C E 1º ANDAR",
      items: [
        { id: "g_1", text: "O chão é limpo e lavado regularmente?", max: 5 },
        { id: "g_2", text: "Argamassa limpa?", max: 5 },
        { id: "g_3", text: "Cantos e bordas aspirados regularmente?", max: 5 },
        { id: "g_4", text: "Rodapés limpos, sem poeira e manchas?", max: 5 },
        { id: "g_5", text: "As bordas e cantos estão livres de teias e poeira?", max: 5 },
        { id: "g_6", text: "A parede está livre de manchas, pichações, etc.?", max: 5 },
        { id: "g_7", text: "Portas limpas e livres de impressões digitais e manchas?", max: 5 },
        { id: "g_8", text: "Por trás das portas, livres de teias e poeira?", max: 5 },
        { id: "g_9", text: "Todas as plantas e decorações estão livres de poeira e teias?", max: 5 },
        { id: "g_10", text: "Todas as plantas foram regadas regularmente?", max: 5 },
        { id: "g_11", text: "O fundo dos móveis está livre de danos?", max: 5 },
        { id: "g_12", text: "O tampo das mesas está livre de poeira?", max: 5 },
        { id: "g_13", text: "Os recipientes de lixo são esvaziados regularmente?", max: 5 },
        { id: "g_14", text: "A superfície dos itens eletrônicos está limpa?", max: 5 },
        { id: "g_15", text: "Por trás dos itens eletrônicos são espanados e aspirados?", max: 5 },
        { id: "g_16", text: "Atrás das mesas são espanadas e aspiradas regularmente?", max: 5 },
        { id: "g_17", text: "Todas as janelas estão livres de manchas e impressões digitais?", max: 5 },
        { id: "g_18", text: "Todas as bordas estão livres de poeira e limpas?", max: 5 },
      ]
    },
    {
      id: "casas_banho",
      name: "CASAS DE BANHO",
      items: [
        { id: "b_1", text: "Todos os dispensadores estão limpos e devidamente recarregados?", max: 5 },
        { id: "b_2", text: "Todos os dispensadores estão em boas condições?", max: 5 },
        { id: "b_3", text: "Os cantos e bordas são varridos ou aspirados completamente?", max: 5 },
        { id: "b_4", text: "Por trás das portas está livre de teias de poeira e teias de aranha?", max: 5 },
        { id: "b_5", text: "Todas as pias estão livres de manchas de água e limpas?", max: 5 },
        { id: "b_6", text: "As peças de aço inoxidável são polidas e livres de manchas de água?", max: 5 },
        { id: "b_7", text: "Todos os banheiros/urinóis estão livres de manchas de água?", max: 5 },
        { id: "b_8", text: "A parede está livre de poeira, teias de aranha, escritas e autocolantes?", max: 5 },
        { id: "b_9", text: "Existe problema de mau cheiro?", max: 5 },
        { id: "b_10", text: "O chão está limpo?", max: 5 },
        { id: "b_11", text: "O chão é limpo diariamente com limpador desinfetante?", max: 5 },
        { id: "b_12", text: "Todas as janelas estão livres de manchas e impressões digitais?", max: 5 },
      ]
    }
  ]
};

// 2. BROLL S & C
const BROLL_TEMPLATE = {
  sections: [
    {
      id: "pessoal_limpezas",
      name: "PESSOAL DE LIMPEZAS",
      items: [
        ...BASE_TEMPLATE.sections[0].items,
        { id: "pl_7", text: "Os cacifos da equipe estão limpos e em ordem?", max: 5 },
      ]
    },
    {
      id: "exterior",
      name: "EXTERIOR",
      items: [
        { id: "ex_1", text: "As manchas de óleo de viaturas são limpas regularmente?", max: 5 },
        { id: "ex_2", text: "Os detritos, folhas e lixo são varridos regularmente?", max: 5 },
        { id: "ex_3", text: "O estacionamento é livre de escritas, autocolantes e teias?", max: 5 },
        { id: "ex_4", text: "Os espelhos estão limpos livres de pó?", max: 5 },
        { id: "ex_5", text: "A tubagem está limpa livre de pó e teias?", max: 5 },
        { id: "ex_6", text: "Os extintores de incêndio e mangueiras estão limpos livres de pó?", max: 5 },
        { id: "ex_7", text: "As paredes estão livres de manchas e pichações?", max: 5 },
        { id: "ex_8", text: "As Cancelas estão livres de manchas e pó?", max: 5 },
        { id: "ex_9", text: "O jardim está livre de lixo e varrido regularmente?", max: 5 },
        { id: "ex_10", text: "O jardim está livre de ervas daninhas?", max: 5 },
        { id: "ex_11", text: "As plantas e árvores são podadas regularmente?", max: 5 },
        { id: "ex_12", text: "As plantas estão livres de pragas?", max: 5 },
        { id: "ex_13", text: "Paredes exteriores livres de poeira e teias de aranha?", max: 5 },
        { id: "ex_14", text: "Todas as janelas exteriores estão limpas, sem manchas?", max: 5 },
        { id: "ex_15", text: "As janelas estão livres de manchas de água seca?", max: 5 },
        { id: "ex_16", text: "Os trilhos estão livres de poeira e sujeira?", max: 5 },
        { id: "ex_17", text: "Os passeios e passedeiras são lavados a pressão regularmente?", max: 5 },
        { id: "ex_18", text: "Os passeios pedestres estão limpos, sem detritos e lixo?", max: 5 },
        { id: "ex_19", text: "As paredes das escadas estão limpas e sem manchas?", max: 5 },
        { id: "ex_20", text: "As escadas estão livres de poeira, detritos e teias de aranha?", max: 5 },
        { id: "ex_21", text: "O lixo é arrumado e recolhido com a frequência acordada?", max: 5 },
        { id: "ex_22", text: "Os depósitos (tambores) de lixo são lavados regularmente?", max: 5 },
        { id: "ex_23", text: "O local de depósito de lixo é lavado e desinfectado regularmente?", max: 5 },
        { id: "ex_24", text: "As partes altas estão livres de teias e pó?", max: 5 },
        { id: "ex_25", text: "Canal limpo e desbloqueado?", max: 5 },
        { id: "ex_26", text: "Livre de odor?", max: 5 },
        { id: "ex_27", text: "Descarga de águas feito no local próprio?", max: 5 },
      ]
    },
    {
      id: "recepcao_corredores",
      name: "RECEPÇÃO E CORREDORES",
      items: [
        { id: "rc_1", text: "O tapete é aspirado regularmente?", max: 5 },
        { id: "rc_2", text: "Os cantos e bordas são aspirados regularmente?", max: 5 },
        { id: "rc_3", text: "Existem muitos pontos e manchas no tapete?", max: 5 },
        { id: "rc_4", text: "O chão é limpo e lavado regularmente?", max: 5 },
        { id: "rc_5", text: "Argamassa limpa?", max: 5 },
        { id: "rc_6", text: "Rodapés limpos, sem poeira e manchas?", max: 5 },
        { id: "rc_7", text: "As bordas e cantos estão livres de teias e poeira?", max: 5 },
        { id: "rc_8", text: "A parede está livre de manchas, pichações, etc.?", max: 5 },
        { id: "rc_9", text: "Portas limpas e livres de impressões digitais e manchas?", max: 5 },
        { id: "rc_10", text: "Todas as plantas e decorações estão livres de poeira e teias?", max: 5 },
        { id: "rc_11", text: "O tampo das mesas está livre de poeira?", max: 5 },
        { id: "rc_12", text: "Os recipientes de lixo são esvaziados regularmente?", max: 5 },
        { id: "rc_13", text: "A superfície dos itens eletrônicos está limpa?", max: 5 },
        { id: "rc_14", text: "Atrás das mesas são espanadas e aspiradas regularmente?", max: 5 },
        { id: "rc_15", text: "Todas as janelas estão livres de manchas e impressões digitais?", max: 5 },
        { id: "rc_16", text: "Todas as bordas estão livres de poeira e limpas?", max: 5 },
      ]
    },
    {
      id: "elevadores",
      name: "ELEVADORES",
      items: [
        { id: "el_1", text: "O chão está limpo e livre de manchas?", max: 5 },
        { id: "el_2", text: "As paredes e portas estão limpos e livres de impressões digitais?", max: 5 },
        { id: "el_3", text: "Os botões são limpos e desinfectados com frequência?", max: 5 },
        { id: "el_4", text: "Os espelhos estão livres de impressões digitais?", max: 5 },
        { id: "el_5", text: "Os carris das portas estão livres de detritos?", max: 5 },
      ]
    },
    {
      id: "copas",
      name: "COPAS",
      items: [
        ...BASE_TEMPLATE.sections[2].items,
        { id: "c_9", text: "A chaleira está limpa dentro e fora?", max: 5 },
        { id: "c_10", text: "Os armários estão limpos e livres de migalhas?", max: 5 },
        { id: "c_11", text: "O lavatório e torneira estão sempre limpos?", max: 5 },
        { id: "c_12", text: "A loiça está lavada e arrumada devidamente?", max: 5 },
        { id: "c_13", text: "Lata de lixo esvaziada e limpa todos os dias?", max: 5 },
      ]
    },
    {
      id: "casas_banho",
      name: "CASAS DE BANHO",
      items: [
        ...BASE_TEMPLATE.sections[3].items,
        { id: "b_10", text: "O chão está limpo?", max: 5 },
        { id: "b_11", text: "O chão é limpo diariamente com limpador desinfetante?", max: 5 },
        { id: "b_12", text: "O chão está limpo e limpo regularmente?", max: 5 },
      ]
    }
  ]
};

// 3. CASINO
const CASINO_TEMPLATE = {
  sections: [
    {
      id: "pessoal_limpezas",
      name: "PESSOAL DE LIMPEZAS",
      items: [
        ...BASE_TEMPLATE.sections[0].items,
        { id: "pl_7", text: "Os cacifos da equipe estão limpos e em ordem?", max: 5 },
      ]
    },
    {
      id: "exterior",
      name: "EXTERIOR",
      items: [
        { id: "ex_1", text: "As manchas de óleo de viaturas são limpas regularmente?", max: 5 },
        { id: "ex_2", text: "Os detritos, folhas e lixo são varridos regularmente?", max: 5 },
        { id: "ex_3", text: "O estacionamento é livre de escritas, autocolantes e teias?", max: 5 },
        { id: "ex_4", text: "Paredes exteriores livres de poeira e teias de aranha?", max: 5 },
        { id: "ex_5", text: "Todas as janelas exteriores estão limpas, sem manchas?", max: 5 },
        { id: "ex_6", text: "As janelas estão livres de manchas de água seca?", max: 5 },
        { id: "ex_7", text: "Os trilhos estão livres de poeira e sujeira?", max: 5 },
        { id: "ex_8", text: "Os passeios e passedeiras são lavados a pressão regularmente?", max: 5 },
        { id: "ex_9", text: "Os passeios pedestres estão limpos, sem detritos e lixo?", max: 5 },
        { id: "ex_10", text: "O chão da área de lixo está livre de poeira, detritos e teias?", max: 5 },
        { id: "ex_11", text: "O chão da área de lixo é varrido e limpo regularmente?", max: 5 },
        { id: "ex_12", text: "O chão da área de lixo é lavado e desinfectado regularmente?", max: 5 },
        { id: "ex_13", text: "Canal limpo e desbloqueado?", max: 5 },
        { id: "ex_14", text: "Livre de odor?", max: 5 },
        { id: "ex_15", text: "Descarga de águas feito no local próprio?", max: 5 },
      ]
    },
    {
      id: "casas_banho_jogos",
      name: "CASAS DE BANHO SALA DE JOGOS",
      items: [
        ...BASE_TEMPLATE.sections[3].items.slice(0, 9),
        { id: "b_10", text: "O chão está limpo?", max: 5 },
        { id: "b_11", text: "O chão é limpo diariamente com limpador desinfetante?", max: 5 },
      ]
    },
    {
      id: "chao_dificil",
      name: "CHÃO DIFÍCIL CORREDOR",
      items: [
        { id: "cd_1", text: "O chão é limpo e lavado regularmente?", max: 5 },
        { id: "cd_2", text: "Cantos e bordas aspirados regularmente?", max: 5 },
        { id: "cd_3", text: "Extintores limpos e em condições?", max: 5 },
        { id: "cd_4", text: "As bordas e cantos estão livres de teias e poeira?", max: 5 },
        { id: "cd_5", text: "A parede está livre de manchas, pichações, etc.?", max: 5 },
        { id: "cd_6", text: "Rodapés limpos, sem poeira e manchas?", max: 5 },
        { id: "cd_7", text: "Portas limpas e livres de impressões digitais e manchas?", max: 5 },
        { id: "cd_8", text: "Por trás das portas, livres de teias e poeira?", max: 5 },
      ]
    },
    {
      id: "sala_jogos",
      name: "SALA DE JOGOS",
      items: [
        { id: "sj_1", text: "O tapete é aspirado regularmente?", max: 5 },
        { id: "sj_2", text: "Os cantos e bordas são aspirados regularmente?", max: 5 },
        { id: "sj_3", text: "Existem muitos pontos e manchas no tapete?", max: 5 },
        { id: "sj_4", text: "O chão é limpo e lavado regularmente?", max: 5 },
        { id: "sj_5", text: "Argamassa limpa?", max: 5 },
        { id: "sj_6", text: "Rodapés limpos, sem poeira e manchas?", max: 5 },
        { id: "sj_7", text: "As bordas e cantos estão livres de teias e poeira?", max: 5 },
        { id: "sj_8", text: "A parede está livre de manchas, pichações, etc.?", max: 5 },
        { id: "sj_9", text: "Portas limpas e livres de impressões digitais e manchas?", max: 5 },
        { id: "sj_10", text: "Todas as plantas e decorações estão livres de poeira e teias?", max: 5 },
        { id: "sj_11", text: "As caixas de atendimento estão livres de pó?", max: 5 },
        { id: "sj_12", text: "O fundo dos móveis está livre de danos?", max: 5 },
        { id: "sj_13", text: "O tampo das mesas está livre de poeira?", max: 5 },
        { id: "sj_14", text: "Os recipientes de lixo são esvaziados regularmente?", max: 5 },
        { id: "sj_15", text: "A superfície dos itens eletrônicos está limpa?", max: 5 },
        { id: "sj_16", text: "Os quadros de paredes estão livres de pó?", max: 5 },
        { id: "sj_17", text: "As cadeiras estão livres de manchas e pó?", max: 5 },
        { id: "sj_18", text: "As máquinas de jogos estão livres de pó?", max: 5 },
        { id: "sj_19", text: "Todas as janelas estão livres de manchas e impressões digitais?", max: 5 },
        { id: "sj_20", text: "Todas as bordas estão livres de poeira e limpas?", max: 5 },
      ]
    },
    {
      id: "administracao",
      name: "ADMINISTRAÇÃO",
      items: [
        { id: "ad_1", text: "O tapete é aspirado regularmente?", max: 5 },
        { id: "ad_2", text: "Os cantos e bordas são aspirados regularmente?", max: 5 },
        { id: "ad_3", text: "Existem muitos pontos e manchas no tapete?", max: 5 },
        { id: "ad_4", text: "O chão é limpo e lavado regularmente?", max: 5 },
        { id: "ad_5", text: "Argamassa limpa?", max: 5 },
        { id: "ad_6", text: "Rodapés limpos, sem poeira e manchas?", max: 5 },
        { id: "ad_7", text: "As bordas e cantos estão livres de teias e poeira?", max: 5 },
        { id: "ad_8", text: "A parede está livre de manchas, pichações, etc.?", max: 5 },
        { id: "ad_9", text: "Portas limpas e livres de impressões digitais e manchas?", max: 5 },
        { id: "ad_10", text: "Todas as plantas e decorações estão livres de poeira e teias?", max: 5 },
        { id: "ad_11", text: "O fundo dos móveis está livre de danos?", max: 5 },
        { id: "ad_12", text: "O tampo das mesas está livre de poeira?", max: 5 },
        { id: "ad_13", text: "Os recipientes de lixo são esvaziados regularmente?", max: 5 },
        { id: "ad_14", text: "A superfície dos itens eletrônicos está limpa?", max: 5 },
        { id: "ad_15", text: "Atrás das mesas são espanadas e aspiradas regularmente?", max: 5 },
        { id: "ad_16", text: "Todas as janelas estão livres de manchas e impressões digitais?", max: 5 },
        { id: "ad_17", text: "Todas as bordas estão livres de poeira e limpas?", max: 5 },
      ]
    },
    {
      id: "copa_administracao",
      name: "COPA ADMINISTRAÇÃO",
      items: [
        { id: "ca_1", text: "O chão é limpo e lavado regularmente?", max: 5 },
        { id: "ca_2", text: "Cantos e bordas aspirados regularmente?", max: 5 },
        { id: "ca_3", text: "Rodapés limpos, sem poeira e manchas?", max: 5 },
        { id: "ca_4", text: "A parede está livre de manchas, pichações, etc.?", max: 5 },
        { id: "ca_5", text: "Porta limpa e livre de impressões digitais e manchas?", max: 5 },
        { id: "ca_6", text: "O microondas é limpo regularmente?", max: 5 },
        { id: "ca_7", text: "A geleira é limpa regularmente?", max: 5 },
        { id: "ca_8", text: "A chaleira está sempre limpa sem calcário?", max: 5 },
        { id: "ca_9", text: "O tampo das mesas está livre de poeira?", max: 5 },
        { id: "ca_10", text: "Cadeiras limpas e lavadas regularmente?", max: 5 },
        { id: "ca_11", text: "Armários limpos e loiça arrumada devidamente?", max: 5 },
        { id: "ca_12", text: "Lavatório e torneira limpas?", max: 5 },
        { id: "ca_13", text: "Lata de lixo esvazia e limpa todos os dias?", max: 5 },
      ]
    },
    {
      id: "casas_banho_admin",
      name: "CASAS DE BANHO ADMINISTRAÇÃO",
      items: [
        ...BASE_TEMPLATE.sections[3].items.slice(0, 9),
        { id: "b_10", text: "O chão está limpo?", max: 5 },
        { id: "b_11", text: "O chão é limpo diariamente com limpador desinfetante?", max: 5 },
      ]
    },
    {
      id: "casas_banho_staff",
      name: "CASAS DE BANHO STAFF",
      items: [
        { id: "bs_1", text: "Os cantos e bordas são varridos ou aspirados completamente?", max: 5 },
        { id: "bs_2", text: "Por trás das portas está livre de teias de poeira e teias de aranha?", max: 5 },
        { id: "bs_3", text: "Todas as pias estão livres de manchas de água e limpas?", max: 5 },
        { id: "bs_4", text: "Todos os banheiros/urinóis estão livres de manchas de água?", max: 5 },
        { id: "bs_5", text: "A parede está livre de poeira, teias, escritas e autocolantes?", max: 5 },
        { id: "bs_6", text: "Existe problema de mau cheiro?", max: 5 },
        { id: "bs_7", text: "O chão está limpo?", max: 5 },
        { id: "bs_8", text: "O chão é limpo diariamente com limpador desinfetante?", max: 5 },
      ]
    },
    {
      id: "copa_staff",
      name: "COPA STAFF",
      items: [
        { id: "cs_1", text: "O chão é limpo e lavado regularmente?", max: 5 },
        { id: "cs_2", text: "Cantos e bordas aspirados regularmente?", max: 5 },
        { id: "cs_3", text: "Rodapés limpos, sem poeira e manchas?", max: 5 },
        { id: "cs_4", text: "A parede está livre de manchas, pichações, etc.?", max: 5 },
        { id: "cs_5", text: "Porta limpa e livre de impressões digitais e manchas?", max: 5 },
        { id: "cs_6", text: "Por trás da porta, livre de teias e poeira?", max: 5 },
        { id: "cs_7", text: "O microondas é limpo regularmente?", max: 5 },
        { id: "cs_8", text: "A geleira é limpa regularmente?", max: 5 },
        { id: "cs_9", text: "A chaleira está sempre limpa sem calcário?", max: 5 },
        { id: "cs_10", text: "O tampo das mesas está livre de poeira?", max: 5 },
        { id: "cs_11", text: "Cadeiras limpas e lavadas regularmente?", max: 5 },
        { id: "cs_12", text: "Armários limpos e loiça arrumada devidamente?", max: 5 },
        { id: "cs_13", text: "Lavatório e torneira limpas?", max: 5 },
        { id: "cs_14", text: "Lata de lixo esvaziada e limpa todos os dias?", max: 5 },
      ]
    }
  ]
};

// 4. COMMOTOR GMS
const COMMOTOR_TEMPLATE = {
  sections: [
    {
      id: "pessoal_limpezas",
      name: "PESSOAL DE LIMPEZAS",
      items: [
        ...BASE_TEMPLATE.sections[0].items,
        { id: "pl_7", text: "Os cacifos da equipe estão limpos e em ordem?", max: 5 },
      ]
    },
    {
      id: "exterior",
      name: "EXTERIOR",
      items: [
        { id: "ex_1", text: "As manchas de óleo de viaturas são limpas regularmente?", max: 5 },
        { id: "ex_2", text: "Os detritos, folhas e lixo são varridos regularmente?", max: 5 },
        { id: "ex_3", text: "O estacionamento é livre de escritas, autocolantes e teias?", max: 5 },
        { id: "ex_4", text: "O chão e parede da piscina são limpos e lavados regularmente?", max: 5 },
        { id: "ex_5", text: "A água está limpa e devidamente tratada?", max: 5 },
        { id: "ex_6", text: "A bomba e barracuda estão funcionando devidamente?", max: 5 },
        { id: "ex_7", text: "A manutenção manual e semanal está sendo observada?", max: 5 },
        { id: "ex_8", text: "Paredes exteriores livres de poeira e teias de aranha?", max: 5 },
        { id: "ex_9", text: "Todas as janelas exteriores estão limpas, sem manchas?", max: 5 },
        { id: "ex_10", text: "As janelas estão livres de manchas de água seca?", max: 5 },
        { id: "ex_11", text: "Os trilhos estão livres de poeira e sujeira?", max: 5 },
        { id: "ex_12", text: "Os passeios e passedeiras são lavados regularmente?", max: 5 },
        { id: "ex_13", text: "Os passeios pedestres estão limpos, sem detritos e lixo?", max: 5 },
        { id: "ex_14", text: "As paredes das escadas estão limpas e sem manchas?", max: 5 },
        { id: "ex_15", text: "As escadas estão livres de poeira, detritos e teias de aranha?", max: 5 },
        { id: "ex_16", text: "Canal limpo e desbloqueado?", max: 5 },
        { id: "ex_17", text: "Livre de odor?", max: 5 },
        { id: "ex_18", text: "Descarga de águas feito no local próprio?", max: 5 },
      ]
    },
    {
      id: "gabinetes_apartamentos",
      name: "GABINETES E APARTAMENTOS",
      items: [
        { id: "ga_1", text: "O tapete é aspirado regularmente?", max: 5 },
        { id: "ga_2", text: "Os cantos e bordas são aspirados regularmente?", max: 5 },
        { id: "ga_3", text: "Existem muitos pontos e manchas no tapete?", max: 5 },
        { id: "ga_4", text: "O chão é limpo e lavado regularmente?", max: 5 },
        { id: "ga_5", text: "Argamassa limpa?", max: 5 },
        { id: "ga_6", text: "Cantos e bordas aspirados regularly?", max: 5 },
        { id: "ga_7", text: "Rodapés limpos, sem poeira e manchas?", max: 5 },
        { id: "ga_8", text: "As bordas e cantos estão livres de teias e poeira?", max: 5 },
        { id: "ga_9", text: "A parede está livre de manchas, pichações, etc.?", max: 5 },
        { id: "ga_10", text: "Portas limpas e livres de impressões digitais e manchas?", max: 5 },
        { id: "ga_11", text: "Por trás das portas, livres de teias e poeira?", max: 5 },
        { id: "ga_12", text: "Todas as plantas e decorações estão livres de poeira e teias?", max: 5 },
        { id: "ga_13", text: "O tampo das mesas está livre de poeira?", max: 5 },
        { id: "ga_14", text: "Os recipientes de lixo são esvaziados regularmente?", max: 5 },
        { id: "ga_15", text: "A superfície dos itens eletrônicos está limpa?", max: 5 },
        { id: "ga_16", text: "Atrás das mesas são espanadas e aspiradas regularmente?", max: 5 },
        { id: "ga_17", text: "Todas as janelas estão livres de manchas e impressões digitais?", max: 5 },
        { id: "ga_18", text: "Todas as bordas estão livres de poeira e limpas?", max: 5 },
      ]
    },
    {
      id: "copas",
      name: "COPAS",
      items: [
        ...BASE_TEMPLATE.sections[2].items,
        { id: "c_9", text: "A chaleira está limpa dentro e fora?", max: 5 },
        { id: "c_10", text: "Os armários estão limpos e livres de migalhas?", max: 5 },
        { id: "c_11", text: "O lavatório e torneira estão sempre limpos?", max: 5 },
        { id: "c_12", text: "A loiça está lavada e arrumada devidamente?", max: 5 },
        { id: "c_13", text: "Lata de lixo esvaziada e limpa todos os dias?", max: 5 },
      ]
    },
    {
      id: "casas_banho",
      name: "CASAS DE BANHO",
      items: [
        ...BASE_TEMPLATE.sections[3].items,
        { id: "b_10", text: "O chão está limpo?", max: 5 },
        { id: "b_11", text: "O chão é limpo diariamente com limpador desinfetante?", max: 5 },
        { id: "b_12", text: "Todas as janelas estão livres de manchas e impressões digitais?", max: 5 },
      ]
    }
  ]
};

// 8. SHOPPING 24
const SHOPPING_24_TEMPLATE = {
  sections: [
    {
      id: "pessoal_limpezas",
      name: "PESSOAL DE LIMPEZAS",
      items: [
        ...BASE_TEMPLATE.sections[0].items,
        { id: "pl_7", text: "Os cacifos da equipe estão limpos e em ordem?", max: 5 },
      ]
    },
    {
      id: "exterior",
      name: "EXTERIOR",
      items: [
        { id: "ex_1", text: "As manchas de óleo de viaturas são limpas regularmente?", max: 5 },
        { id: "ex_2", text: "Os detritos, folhas e lixo são varridos regularmente?", max: 5 },
        { id: "ex_3", text: "O estacionamento é livre de escritas, autocolantes e teias?", max: 5 },
        { id: "ex_4", text: "Paredes livres de poeira e teias de aranha?", max: 5 },
        { id: "ex_5", text: "O chão do depósito de lixo é varrido e lavado regularmente?", max: 5 },
        { id: "ex_6", text: "A parede do depósito de lixo está livre de escritas e manchas?", max: 5 },
        { id: "ex_7", text: "Os tambores de lixo são lavados regularmente?", max: 5 },
        { id: "ex_8", text: "Paredes exteriores livres de poeira e teias de aranha?", max: 5 },
        { id: "ex_9", text: "Todas as janelas exteriores estão limpas, sem manchas?", max: 5 },
        { id: "ex_10", text: "As janelas estão livres de manchas de água seca?", max: 5 },
        { id: "ex_11", text: "Os trilhos estão livres de poeira e sujeira?", max: 5 },
        { id: "ex_12", text: "Os candeeiros são limpos regularmente?", max: 5 },
        { id: "ex_13", text: "Os passeios e passedeiras são lavados a pressão regularmente?", max: 5 },
        { id: "ex_14", text: "Os passeios pedestres estão limpos, sem detritos e lixo?", max: 5 },
        { id: "ex_15", text: "As paredes das escadas estão limpas e sem manchas?", max: 5 },
        { id: "ex_16", text: "As escadas estão livres de poeira, detritos e teias de aranha?", max: 5 },
        { id: "ex_17", text: "Canal limpo e desbloqueado?", max: 5 },
        { id: "ex_18", text: "Livre de odor?", max: 5 },
        { id: "ex_19", text: "Descarga de águas feito no local próprio?", max: 5 },
      ]
    },
    {
      id: "ginasio",
      name: "GINÁSIO",
      items: [
        { id: "gi_1", text: "O chão está limpo e livre de argamassa?", max: 5 },
        { id: "gi_2", text: "As máquinas e halteres estão livres de pó?", max: 5 },
        { id: "gi_3", text: "A parede está limpa livre de manchas e autocolantes?", max: 5 },
        { id: "gi_4", text: "As janelas e vidros estão limpos livres de manchas secas de água?", max: 5 },
        { id: "gi_5", text: "Os espelhos estão limpos livres de impressões digitais?", max: 5 },
        { id: "gi_6", text: "As portas estão limpas livres de pó por cima e por trás?", max: 5 },
      ]
    },
    {
      id: "piscina",
      name: "PISCINA",
      items: [
        { id: "pi_1", text: "O chão está limpo e livre de argamassa?", max: 5 },
        { id: "pi_2", text: "A parede está limpa e livre de manchas e autocolantes?", max: 5 },
      ]
    },
    {
      id: "balnearios",
      name: "BALNEÁRIOS",
      items: [
        ...BASE_TEMPLATE.sections[3].items.slice(0, 9),
        { id: "b_10", text: "O chão está limpo?", max: 5 },
        { id: "b_11", text: "O chão é limpo diariamente com limpador desinfetante?", max: 5 },
      ]
    },
    {
      id: "corredores",
      name: "CORREDORES",
      items: [
        { id: "co_1", text: "O chão está limpo e livre de argamassa?", max: 5 },
        { id: "co_2", text: "As partes altas estão livres de pó e teias de aranha?", max: 5 },
        { id: "co_3", text: "A parede está limpa livre de manchas e autocolantes?", max: 5 },
        { id: "co_4", text: "As janelas e vidros estão limpos livres de manchas secas de água?", max: 5 },
        { id: "co_5", text: "As portas estão limpas livres de pó por cima e por trás?", max: 5 },
        { id: "co_6", text: "As mangueiras de incêndio estão limpas?", max: 5 },
        { id: "co_7", text: "Os extintores de incêndio estão livres de pó?", max: 5 },
        { id: "co_8", text: "Os rodapés estão limpos livres de pó e manchas?", max: 5 },
      ]
    },
    {
      id: "escadas",
      name: "ESCADAS",
      items: [
        { id: "es_1", text: "O chão está limpo e livre de argamassa?", max: 5 },
        { id: "es_2", text: "As partes altas estão livres de pó e teias de aranha?", max: 5 },
        { id: "es_3", text: "A parede está limpa livre de manchas e autocolantes?", max: 5 },
        { id: "es_4", text: "As portas estão limpas livres de pó por cima e por trás?", max: 5 },
        { id: "es_5", text: "Os rodapés estão limpos livres de pó e manchas?", max: 5 },
      ]
    },
    {
      id: "elevador",
      name: "ELEVADOR",
      items: [
        { id: "el_1", text: "O chão está limpo e livre de argamassa?", max: 5 },
        { id: "el_2", text: "A parede está limpa livre de manchas e impressões digitais?", max: 5 },
        { id: "el_3", text: "As paredes são polidas com K4?", max: 5 },
        { id: "el_4", text: "Os espelhos estão limpos livres de impressões digitais?", max: 5 },
        { id: "el_5", text: "As portas estão limpas livres de pó e impressões?", max: 5 },
      ]
    },
    {
      id: "entradas",
      name: "ENTRADAS",
      items: [
        { id: "en_1", text: "O chão está limpo e livre de argamassa?", max: 5 },
        { id: "en_2", text: "A parede está limpa livre de manchas e autocolantes?", max: 5 },
        { id: "en_3", text: "As janelas e vidros estão limpos livres de manchas secas de água?", max: 5 },
        { id: "en_4", text: "As portas estão limpas livres de pó por cima e por trás?", max: 5 },
        { id: "en_5", text: "Os rodapés estão limpos livres de pó e manchas?", max: 5 },
        { id: "en_6", text: "As mesas e cadeiras estão limpas?", max: 5 },
      ]
    },
    {
      id: "casas_banho",
      name: "CASAS DE BANHO",
      items: [
        ...BASE_TEMPLATE.sections[3].items,
        { id: "b_10", text: "O chão está limpo?", max: 5 },
        { id: "b_11", text: "O chão é limpo diariamente com limpador desinfetante?", max: 5 },
      ]
    }
  ]
};

// ------------------------------------------------------------
// CLIENT TEMPLATES MAP
// ------------------------------------------------------------
export const CLIENT_TEMPLATES = {
  "Baker Hughes": BASE_TEMPLATE,
  "Bayport": BASE_TEMPLATE,
  "Civitas": BASE_TEMPLATE,
  "EGPAF": BASE_TEMPLATE,
  "ExxonMobil": BASE_TEMPLATE,
  "FCDO": BASE_TEMPLATE,
  "GDA": BASE_TEMPLATE,
  "Hollard Seguros R/C": BASE_TEMPLATE,
  "Hollard Seguros 4º": BASE_TEMPLATE,
  "Intercar KIA": BASE_TEMPLATE,
  "ISCTEM 1": BASE_TEMPLATE,
  "ISCTEM 2": BASE_TEMPLATE,
  "Karingani": BASE_TEMPLATE,
  "Multi Choice Torres Rani": BASE_TEMPLATE,
  "Siemens": BASE_TEMPLATE,
  "SIP": BASE_TEMPLATE,
  "Torres VBC-INSS": BASE_TEMPLATE,
  "Zimpeto Square": BASE_TEMPLATE,
  "Multi Choice Maputo": BASE_TEMPLATE,
  "Kactus": BASE_TEMPLATE,
  "MC Dermott": BASE_TEMPLATE,
  "Motraco": BASE_TEMPLATE,
  "Gestfuel Mussumbuluco": BASE_TEMPLATE,
  "Gestfuel Estrada Velha": BASE_TEMPLATE,
  "Broll Acacia Estate": BASE_TEMPLATE,
  "Pronova": BASE_TEMPLATE,
  "Tec. Indus. Museu": BASE_TEMPLATE,
  "C. Belga": BASE_TEMPLATE,
  "C. Belga Berreau": BASE_TEMPLATE,
  
  "Biofund": BIOFUND_TEMPLATE,
  "Broll S & C": BROLL_TEMPLATE,
  "Casino": CASINO_TEMPLATE,
  "Commotor GMS": COMMOTOR_TEMPLATE,
  "Shopping 24": SHOPPING_24_TEMPLATE,
};

// ------------------------------------------------------------
// HELPER: getTemplate(clientName)
// ------------------------------------------------------------
export function getTemplate(clientName) {
  return CLIENT_TEMPLATES[clientName] || BASE_TEMPLATE;
}
