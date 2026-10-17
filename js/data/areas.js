/* 研究方向、课题、会议期刊数据（截稿日期为近似值，每月按 30 天计） */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});

  // 论文等级：thr=录用门槛（论文质量分），rep=声望，cite=年引用基数，value=投稿策略中的价值权重
  RS.TIERS = {
    A: { name: 'A类', thr: 66, rep: 4.5, cite: 11, value: 10 },
    B: { name: 'B类', thr: 56, rep: 2, cite: 4.5, value: 4 },
    C: { name: 'C类', thr: 46, rep: 1, cite: 2.2, value: 2 },
    W: { name: 'Workshop', thr: 34, rep: 0.4, cite: 1.2, value: 0.8 },
    P: { name: '预印本', thr: 0, rep: 0.15, cite: 1.5, value: 0.3 },
  };

  const VENUES = (RS.VENUES = {});
  // dl: [[月, 日], ...]  review: 审稿天数  parity: 'odd'/'even' 仅奇/偶数年举办
  function V(id, name, tier, dl, review, o) {
    o = o || {};
    VENUES[id] = { id, name, tier, dl, review, type: tier === 'W' ? 'ws' : 'conf', parity: o.parity || null, rebuttal: !!o.rebuttal };
  }
  function J(id, name, tier, review) {
    VENUES[id] = { id, name, tier, dl: null, review, type: 'jour', parity: null, rebuttal: false };
  }
  VENUES.arxiv = { id: 'arxiv', name: 'arXiv', tier: 'P', dl: null, review: 0, type: 'pre', parity: null, rebuttal: false };

  // —— 人工智能 / 机器学习 ——
  V('neurips', 'NeurIPS', 'A', [[5, 15]], 130, { rebuttal: true });
  V('icml', 'ICML', 'A', [[1, 28]], 95, { rebuttal: true });
  V('iclr', 'ICLR', 'A', [[9, 28]], 115, { rebuttal: true });
  V('aaai', 'AAAI', 'A', [[8, 10]], 110, { rebuttal: true });
  V('ijcai', 'IJCAI', 'A', [[1, 18]], 95, { rebuttal: true });
  V('aistats', 'AISTATS', 'B', [[10, 10]], 100);
  V('uai', 'UAI', 'B', [[2, 15]], 90);
  V('colt', 'COLT', 'A', [[2, 8]], 85);
  J('jmlr', 'JMLR', 'A', 240);
  J('tmlr', 'TMLR', 'B', 120);
  V('ml_ws', 'NeurIPS Workshop', 'W', [[9, 5]], 30);
  // —— 计算机视觉 ——
  V('cvpr', 'CVPR', 'A', [[11, 10]], 105, { rebuttal: true });
  V('iccv', 'ICCV', 'A', [[3, 7]], 125, { parity: 'odd', rebuttal: true });
  V('eccv', 'ECCV', 'A', [[3, 7]], 125, { parity: 'even', rebuttal: true });
  V('bmvc', 'BMVC', 'C', [[5, 1]], 90);
  V('wacv', 'WACV', 'C', [[7, 15]], 90);
  J('tpami', 'TPAMI', 'A', 270);
  J('ijcv', 'IJCV', 'A', 240);
  V('cv_ws', 'CVPR Workshop', 'W', [[3, 10]], 30);
  // —— 自然语言处理 ——
  V('acl', 'ACL', 'A', [[2, 15]], 90, { rebuttal: true });
  V('emnlp', 'EMNLP', 'A', [[5, 20]], 95, { rebuttal: true });
  V('naacl', 'NAACL', 'B', [[10, 15]], 95);
  V('coling', 'COLING', 'B', [[9, 15]], 100);
  V('eacl', 'EACL', 'C', [[10, 10]], 90);
  J('tacl', 'TACL', 'B', 150);
  V('nlp_ws', 'ACL Workshop', 'W', [[4, 20]], 30);
  // —— 计算机系统 ——
  V('osdi', 'OSDI', 'A', [[12, 5]], 95);
  V('sosp', 'SOSP', 'A', [[4, 15]], 105, { parity: 'odd' });
  V('atc', 'USENIX ATC', 'A', [[1, 10]], 100);
  V('nsdi', 'NSDI', 'A', [[4, 25], [9, 18]], 100);
  V('eurosys', 'EuroSys', 'B', [[5, 15], [10, 15]], 100);
  V('asplos', 'ASPLOS', 'A', [[2, 25], [6, 5], [10, 10]], 110);
  V('fast', 'FAST', 'A', [[9, 20]], 85);
  V('mlsys', 'MLSys', 'B', [[10, 25]], 100);
  V('socc', 'SoCC', 'B', [[5, 1]], 90);
  J('tocs', 'TOCS', 'A', 270);
  V('sys_ws', 'HotOS Workshop', 'W', [[5, 5]], 40);
  // —— 网络与安全 ——
  V('sp', 'IEEE S&P', 'A', [[6, 5], [11, 14]], 100);
  V('ccs', 'CCS', 'A', [[1, 10], [4, 29]], 100);
  V('usenixsec', 'USENIX Security', 'A', [[2, 5], [6, 4], [9, 10]], 100);
  V('ndss', 'NDSS', 'A', [[4, 20], [7, 10]], 95);
  V('raid', 'RAID', 'B', [[4, 1]], 90);
  V('acsac', 'ACSAC', 'B', [[6, 1]], 100);
  V('esorics', 'ESORICS', 'B', [[4, 10]], 90);
  J('tdsc', 'TDSC', 'A', 240);
  V('sec_ws', 'Security Workshop', 'W', [[8, 1]], 35);
  // —— 理论计算机 ——
  V('stoc', 'STOC', 'A', [[11, 4]], 90);
  V('focs', 'FOCS', 'A', [[4, 4]], 85);
  V('soda', 'SODA', 'A', [[7, 8]], 85);
  V('icalp', 'ICALP', 'B', [[2, 10]], 65);
  V('ccc', 'CCC', 'B', [[2, 15]], 75);
  V('itcs', 'ITCS', 'B', [[9, 5]], 60);
  V('esa', 'ESA', 'B', [[4, 20]], 65);
  J('jacm', 'JACM', 'A', 360);
  J('sicomp', 'SICOMP', 'A', 300);
  V('th_ws', 'Theory Workshop', 'W', [[6, 1]], 30);
  // —— 人机交互 ——
  V('chi', 'CHI', 'A', [[9, 10]], 105, { rebuttal: true });
  V('uist', 'UIST', 'A', [[4, 5]], 90);
  V('cscw', 'CSCW', 'A', [[1, 15], [7, 15]], 110);
  V('ubicomp', 'UbiComp', 'A', [[2, 15], [5, 15], [8, 15], [11, 15]], 100);
  V('iui', 'IUI', 'B', [[10, 10]], 80);
  V('dis', 'DIS', 'B', [[1, 20]], 80);
  J('tochi', 'TOCHI', 'A', 240);
  V('hci_ws', 'CHI Late-Breaking Work', 'W', [[1, 25]], 35);
  // —— 机器人 ——
  V('rss', 'RSS', 'A', [[1, 30]], 75);
  V('corl', 'CoRL', 'A', [[6, 5]], 90, { rebuttal: true });
  V('icra', 'ICRA', 'A', [[9, 15]], 130);
  V('iros', 'IROS', 'B', [[3, 1]], 120);
  V('humanoids', 'Humanoids', 'C', [[7, 1]], 75);
  J('tro', 'T-RO', 'A', 270);
  V('rob_ws', 'Robotics Workshop', 'W', [[4, 1]], 30);
  // —— 数据库与数据挖掘 ——
  V('sigmod', 'SIGMOD', 'A', [[1, 15], [4, 15], [7, 15], [10, 15]], 75);
  V('vldb', 'VLDB', 'A', [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1]], 70);
  V('icde', 'ICDE', 'A', [[6, 15], [10, 15]], 90);
  V('kdd', 'KDD', 'A', [[2, 8], [8, 3]], 95, { rebuttal: true });
  V('www', 'WWW', 'A', [[10, 10]], 95, { rebuttal: true });
  V('cikm', 'CIKM', 'B', [[5, 20]], 75);
  V('wsdm', 'WSDM', 'B', [[8, 10]], 70);
  J('tkde', 'TKDE', 'A', 240);
  V('db_ws', 'DB Workshop', 'W', [[3, 1]], 30);
  // —— 体系结构 ——
  V('isca', 'ISCA', 'A', [[11, 20]], 100);
  V('micro', 'MICRO', 'A', [[4, 10]], 95);
  V('hpca', 'HPCA', 'A', [[7, 28]], 90);
  V('dac', 'DAC', 'A', [[11, 15]], 95);
  V('date', 'DATE', 'B', [[9, 15]], 90);
  V('iccad', 'ICCAD', 'B', [[4, 15]], 90);
  J('tc', 'IEEE TC', 'A', 240);
  V('arch_ws', 'Arch Workshop', 'W', [[2, 1]], 30);
  // —— 软件工程 ——
  V('icse', 'ICSE', 'A', [[3, 15], [8, 1]], 120);
  V('fse', 'FSE', 'A', [[9, 10]], 100);
  V('ase', 'ASE', 'A', [[5, 30]], 80);
  V('issta', 'ISSTA', 'A', [[1, 25]], 80);
  V('saner', 'SANER', 'B', [[10, 15]], 70);
  V('icsme', 'ICSME', 'B', [[3, 20]], 75);
  J('tse', 'TSE', 'A', 270);
  V('se_ws', 'SE Workshop', 'W', [[2, 20]], 30);
  // —— 图形学 ——
  V('siggraph', 'SIGGRAPH', 'A', [[1, 22]], 75);
  V('sigasia', 'SIGGRAPH Asia', 'A', [[5, 20]], 85);
  V('vis', 'IEEE VIS', 'A', [[3, 30]], 95);
  V('eg', 'Eurographics', 'B', [[10, 5]], 75);
  V('pg', 'Pacific Graphics', 'B', [[6, 1]], 75);
  J('tog', 'ACM TOG', 'A', 240);
  V('gr_ws', 'Graphics Workshop', 'W', [[8, 15]], 30);

  // 课题：heat=初始热度，compute=算力需求系数，en=英文关键词（用于生成论文标题）
  const T = (id, name, heat, compute, en) => ({ id, name, heat, compute, en });

  RS.AREAS = {
    ml: {
      id: 'ml', name: '机器学习', short: 'ML', compute: 1.0, citeMult: 1.4, grantMult: 1.05,
      need: { idea: 35, exp: 90, write: 35 },
      desc: '当下最热门的方向。引用高、基金多，但竞争激烈，而且非常烧显卡。',
      venues: ['neurips', 'icml', 'iclr', 'aaai', 'ijcai', 'colt', 'aistats', 'uai', 'jmlr', 'tmlr', 'ml_ws'],
      topics: [
        T('llm', '大语言模型', 2.4, 1.4, ['Large Language Models', 'LLM Pretraining', 'In-Context Learning']),
        T('diffusion', '扩散模型', 1.8, 1.3, ['Diffusion Models', 'Score-Based Generative Models']),
        T('rl', '强化学习', 1.3, 1.0, ['Offline Reinforcement Learning', 'Policy Optimization', 'Multi-Agent RL']),
        T('gnn', '图神经网络', 0.9, 0.6, ['Graph Neural Networks', 'Graph Representation Learning']),
        T('fl', '联邦学习', 0.8, 0.6, ['Federated Learning', 'Decentralized Training']),
        T('xai', '可解释性', 1.1, 0.8, ['Mechanistic Interpretability', 'Feature Attribution']),
        T('opt', '优化理论', 0.8, 0.2, ['Non-Convex Optimization', 'Stochastic Gradient Descent']),
        T('align', 'AI 对齐与安全', 1.6, 1.1, ['AI Alignment', 'Reward Modeling', 'Robustness to Distribution Shift']),
      ],
      methods: ['Sparse Attention', 'Mixture-of-Experts', 'Contrastive Learning', 'Low-Rank Adaptation', 'Knowledge Distillation', 'Bayesian Deep Learning', 'Meta-Learning', 'Self-Supervised Pretraining', 'Test-Time Scaling', 'State Space Models', 'Flow Matching', 'Preference Optimization'],
    },
    cv: {
      id: 'cv', name: '计算机视觉', short: 'CV', compute: 1.0, citeMult: 1.35, grantMult: 1.0,
      need: { idea: 35, exp: 95, write: 32 },
      desc: '顶会论文数量巨大，引用可观；数据和显卡都很重要。',
      venues: ['cvpr', 'iccv', 'eccv', 'neurips', 'iclr', 'aaai', 'bmvc', 'wacv', 'tpami', 'ijcv', 'cv_ws'],
      topics: [
        T('3d', '三维重建', 1.6, 1.0, ['3D Reconstruction', 'Novel View Synthesis']),
        T('videogen', '视频生成', 2.0, 1.6, ['Video Generation', 'Text-to-Video Synthesis']),
        T('det', '开放词表检测', 1.0, 0.9, ['Open-Vocabulary Object Detection', 'Instance Segmentation']),
        T('ad', '自动驾驶感知', 1.3, 1.1, ['Autonomous Driving Perception', "Bird's-Eye-View Perception"]),
        T('med', '医学影像', 1.0, 0.7, ['Medical Image Segmentation', 'Medical Image Analysis']),
        T('vlm', '视觉语言模型', 2.1, 1.4, ['Vision-Language Models', 'Visual Question Answering']),
        T('edit', '图像编辑', 1.2, 1.0, ['Image Editing', 'Controllable Image Generation']),
        T('pose', '人体姿态估计', 0.9, 0.8, ['Human Pose Estimation', 'Human Mesh Recovery']),
      ],
      methods: ['Vision Transformers', 'Gaussian Splatting', 'Neural Fields', 'Masked Autoencoders', 'Diffusion Priors', 'Optical Flow', 'Point Transformers', 'Language-Image Pretraining', 'Implicit Representations', 'Video Diffusion', 'Token Merging', 'Feature Distillation'],
    },
    nlp: {
      id: 'nlp', name: '自然语言处理', short: 'NLP', compute: 1.1, citeMult: 1.35, grantMult: 1.05,
      need: { idea: 35, exp: 85, write: 38 },
      desc: '大模型时代的风口浪尖，热点切换极快，一不小心就被撞车。',
      venues: ['acl', 'emnlp', 'neurips', 'iclr', 'aaai', 'naacl', 'coling', 'eacl', 'tacl', 'nlp_ws'],
      topics: [
        T('reason', '大模型推理', 2.3, 1.3, ['LLM Reasoning', 'Mathematical Reasoning']),
        T('rag', '检索增强生成', 1.7, 0.9, ['Retrieval-Augmented Generation', 'Open-Domain Question Answering']),
        T('agent', '智能体', 2.2, 1.1, ['LLM Agents', 'Tool Use', 'Web Agents']),
        T('mt', '机器翻译', 0.8, 0.8, ['Machine Translation', 'Low-Resource Translation']),
        T('dialog', '对话系统', 1.0, 0.8, ['Dialogue Systems', 'Task-Oriented Dialogue']),
        T('eval', '评测基准', 1.4, 0.7, ['Benchmarking LLMs', 'LLM Evaluation']),
        T('multi', '多语言', 0.9, 0.8, ['Multilingual NLP', 'Cross-Lingual Transfer']),
        T('halluc', '幻觉检测', 1.5, 0.8, ['Hallucination Detection', 'Factuality']),
      ],
      methods: ['Chain-of-Thought Prompting', 'Retrieval Augmentation', 'Instruction Tuning', 'Preference Optimization', 'Speculative Decoding', 'Contrastive Decoding', 'Self-Consistency', 'Knowledge Editing', 'Multi-Agent Debate', 'Process Reward Models', 'Long-Context Attention', 'Synthetic Data'],
    },
    sys: {
      id: 'sys', name: '计算机系统', short: 'Systems', compute: 0.45, citeMult: 0.8, grantMult: 1.05,
      need: { idea: 30, exp: 125, write: 35 },
      desc: '工程量巨大，一篇顶会要写很多代码；论文少而精，工业界认可度高。',
      venues: ['osdi', 'sosp', 'atc', 'nsdi', 'asplos', 'fast', 'eurosys', 'mlsys', 'socc', 'tocs', 'sys_ws'],
      topics: [
        T('serving', 'LLM 推理服务', 2.0, 1.4, ['LLM Serving', 'Inference Systems']),
        T('dtrain', '分布式训练', 1.5, 1.5, ['Distributed Training', 'Pipeline Parallelism']),
        T('storage', '存储系统', 0.9, 0.3, ['Storage Systems', 'Key-Value Stores']),
        T('os', '操作系统内核', 0.8, 0.2, ['Operating System Kernels', 'Kernel Extensions']),
        T('serverless', 'Serverless', 1.0, 0.4, ['Serverless Computing', 'Cloud Functions']),
        T('sched', '集群调度', 1.1, 0.8, ['Cluster Scheduling', 'GPU Cluster Management']),
        T('cxl', '内存解耦', 1.1, 0.4, ['Memory Disaggregation', 'CXL Memory']),
        T('compiler', 'ML 编译器', 1.3, 0.9, ['ML Compilers', 'Tensor Program Optimization']),
      ],
      methods: ['Disaggregated Memory', 'Kernel Bypass', 'Lock-Free Data Structures', 'Adaptive Batching', 'Paged Attention', 'Learned Indexes', 'RDMA', 'eBPF', 'Persistent Memory', 'Elastic Scheduling', 'Unikernels', 'Speculative Execution'],
    },
    sec: {
      id: 'sec', name: '网络与信息安全', short: 'Security', compute: 0.3, citeMult: 0.85, grantMult: 1.1,
      need: { idea: 35, exp: 95, write: 38 },
      desc: '四大顶会一年多轮投稿，攻防对抗永不过时，政府基金偏爱。',
      venues: ['sp', 'ccs', 'usenixsec', 'ndss', 'raid', 'acsac', 'esorics', 'tdsc', 'sec_ws'],
      topics: [
        T('fuzz', '模糊测试', 1.1, 0.4, ['Fuzzing', 'Vulnerability Discovery']),
        T('side', '侧信道攻击', 0.9, 0.2, ['Side-Channel Attacks', 'Microarchitectural Attacks']),
        T('privacy', '隐私计算', 1.1, 0.4, ['Differential Privacy', 'Secure Multi-Party Computation']),
        T('llmsec', '大模型安全', 2.1, 0.9, ['Jailbreak Attacks', 'Prompt Injection']),
        T('chain', '区块链安全', 0.8, 0.2, ['Smart Contract Security', 'DeFi Attacks']),
        T('malware', '恶意软件检测', 0.8, 0.5, ['Malware Detection', 'Binary Analysis']),
        T('supply', '供应链安全', 1.2, 0.3, ['Software Supply Chain Security', 'Package Ecosystems']),
      ],
      methods: ['Grey-Box Fuzzing', 'Symbolic Execution', 'Differential Privacy', 'Homomorphic Encryption', 'Trusted Execution Environments', 'Taint Analysis', 'Control-Flow Integrity', 'Zero-Knowledge Proofs', 'Adversarial Prompting', 'Binary Lifting', 'Memory Tagging', 'Formal Verification'],
    },
    theory: {
      id: 'theory', name: '理论计算机', short: 'Theory', compute: 0.0, citeMult: 0.45, grantMult: 0.9,
      need: { idea: 70, exp: 45, write: 50 },
      desc: '不需要显卡，只需要纸和笔（和咖啡）。证明一个定理可能要好几年。',
      venues: ['stoc', 'focs', 'soda', 'colt', 'icalp', 'ccc', 'itcs', 'esa', 'jacm', 'sicomp', 'th_ws'],
      topics: [
        T('approx', '近似算法', 1.0, 0, ['Approximation Algorithms', 'Submodular Maximization']),
        T('complex', '计算复杂性', 0.9, 0, ['Circuit Lower Bounds', 'Hardness of Approximation']),
        T('online', '在线算法', 0.9, 0, ['Online Algorithms', 'Online Matching']),
        T('graph', '图算法', 1.0, 0, ['Graph Algorithms', 'Maximum Flow']),
        T('quantum', '量子计算', 1.5, 0, ['Quantum Algorithms', 'Quantum Advantage']),
        T('crypto', '密码学基础', 1.0, 0, ['Lattice-Based Cryptography', 'Indistinguishability Obfuscation']),
        T('agt', '算法博弈论', 0.9, 0, ['Mechanism Design', 'Fair Division']),
        T('lt', '学习理论', 1.3, 0.1, ['Learning Theory', 'Sample Complexity']),
      ],
      methods: ['Semidefinite Programming', 'Spectral Methods', 'Expander Graphs', 'Fourier Analysis', 'Sum-of-Squares', 'Random Walks', 'Lattice Reduction', 'the Polynomial Method', 'Interior Point Methods', 'Communication Complexity', 'Online Learning', 'Sketching'],
      templates: ['Near-Optimal Algorithms for {Task}', 'Improved Bounds for {Task} via {Method}', 'A Polynomial-Time Algorithm for {Task}', 'Hardness of {Task}', '{Task}: Tight Bounds and Beyond', 'Faster {Task} via {Method}', 'On the Complexity of {Task}', 'Simple and Optimal {Task}'],
    },
    hci: {
      id: 'hci', name: '人机交互', short: 'HCI', compute: 0.1, citeMult: 0.75, grantMult: 1.0,
      need: { idea: 45, exp: 80, write: 45 },
      desc: '要做用户实验、招募被试，写作要求高；CHI 一年一度的大狂欢。',
      venues: ['chi', 'uist', 'cscw', 'ubicomp', 'iui', 'dis', 'tochi', 'hci_ws'],
      topics: [
        T('xr', 'AR/VR 交互', 1.3, 0.2, ['Mixed Reality Interaction', 'Virtual Reality']),
        T('access', '无障碍技术', 1.0, 0.1, ['Accessibility', 'Assistive Technology']),
        T('vis', '可视化', 1.0, 0.1, ['Visual Analytics', 'Data Visualization']),
        T('haic', '人智协作', 2.0, 0.4, ['Human-AI Collaboration', 'AI-Assisted Writing']),
        T('wear', '可穿戴设备', 1.0, 0.1, ['Wearable Sensing', 'On-Body Interaction']),
        T('social', '社会计算', 0.9, 0.1, ['Social Computing', 'Online Communities']),
        T('edu', '教育技术', 1.0, 0.2, ['Learning at Scale', 'Programming Education']),
      ],
      methods: ['a Mixed-Methods Study', 'Large-Scale Field Deployment', 'Participatory Design', 'Eye Tracking', 'Haptic Feedback', 'LLM-Powered Interfaces', 'Design Probes', 'Crowdsourcing', 'Wizard-of-Oz Study', 'Interactive Visualization', 'Gesture Recognition', 'Conversational Agents'],
      templates: ['{Acr}: Supporting {Task} with {Method}', 'Understanding {Task} through {Method}', 'Designing for {Task}', '"It Just Works": {Task} in the Wild', 'Exploring {Task} through {Method}', '{Acr}: {Adj} {Task} for Everyone', 'Beyond the Screen: {Task}'],
    },
    robo: {
      id: 'robo', name: '机器人', short: 'Robotics', compute: 0.6, citeMult: 0.95, grantMult: 1.1,
      need: { idea: 35, exp: 115, write: 32 },
      desc: '具身智能正当红。需要真机实验，硬件经常坏，Demo 视频决定一切。',
      venues: ['rss', 'corl', 'icra', 'iros', 'neurips', 'iclr', 'humanoids', 'tro', 'rob_ws'],
      topics: [
        T('embodied', '具身智能', 2.3, 1.2, ['Embodied AI', 'Vision-Language-Action Models']),
        T('manip', '机械臂操作', 1.5, 0.8, ['Robotic Manipulation', 'Dexterous Grasping']),
        T('legged', '足式机器人', 1.2, 0.7, ['Legged Locomotion', 'Quadruped Robots']),
        T('slam', 'SLAM', 0.8, 0.4, ['Visual SLAM', 'Localization and Mapping']),
        T('humanoid', '人形机器人', 2.0, 1.0, ['Humanoid Robots', 'Whole-Body Control']),
        T('il', '模仿学习', 1.4, 0.9, ['Imitation Learning', 'Learning from Demonstrations']),
        T('plan', '运动规划', 0.9, 0.3, ['Motion Planning', 'Trajectory Optimization']),
      ],
      methods: ['Diffusion Policies', 'Sim-to-Real Transfer', 'Model Predictive Control', 'Vision-Language-Action Models', 'Tactile Sensing', 'Reinforcement Learning', 'Imitation Learning', 'Neural SLAM', 'Whole-Body Control', 'World Models', 'Teleoperation Data', 'Foundation Models'],
    },
    db: {
      id: 'db', name: '数据库与数据挖掘', short: 'DB/DM', compute: 0.4, citeMult: 0.95, grantMult: 1.0,
      need: { idea: 32, exp: 100, write: 35 },
      desc: 'SIGMOD/VLDB 一年多轮投稿，节奏稳定；工业界合作机会多。',
      venues: ['sigmod', 'vldb', 'icde', 'kdd', 'www', 'cikm', 'wsdm', 'tkde', 'db_ws'],
      topics: [
        T('vecdb', '向量数据库', 1.6, 0.5, ['Vector Databases', 'Approximate Nearest Neighbor Search']),
        T('qo', '查询优化', 1.0, 0.3, ['Query Optimization', 'Cardinality Estimation']),
        T('rec', '推荐系统', 1.2, 0.8, ['Recommender Systems', 'Click-Through Rate Prediction']),
        T('gmine', '图数据挖掘', 0.9, 0.5, ['Graph Mining', 'Community Detection']),
        T('ts', '时序分析', 1.1, 0.6, ['Time Series Forecasting', 'Anomaly Detection']),
        T('lake', '数据湖', 0.9, 0.3, ['Data Lakes', 'Data Discovery']),
        T('llmdb', '大模型+数据', 1.8, 0.8, ['Text-to-SQL', 'LLMs for Data Management']),
      ],
      methods: ['Learned Cardinality Estimation', 'Vector Indexing', 'Graph Neural Networks', 'Contrastive Learning', 'Approximate Query Processing', 'LLM-Based Agents', 'Columnar Storage', 'Incremental View Maintenance', 'Federated Analytics', 'Hypergraph Learning', 'Time Series Transformers', 'Data Augmentation'],
    },
    arch: {
      id: 'arch', name: '体系结构', short: 'Arch', compute: 0.3, citeMult: 0.7, grantMult: 1.1,
      need: { idea: 35, exp: 120, write: 35 },
      desc: '芯片是国之重器。仿真要跑很久，流片要花很多钱，产业界非常需要。',
      venues: ['isca', 'micro', 'hpca', 'asplos', 'dac', 'date', 'iccad', 'tc', 'arch_ws'],
      topics: [
        T('accel', 'AI 加速器', 1.9, 0.6, ['DNN Accelerators', 'LLM Inference Accelerators']),
        T('pim', '存内计算', 1.3, 0.3, ['Processing-in-Memory', 'Near-Data Processing']),
        T('chiplet', 'Chiplet', 1.3, 0.3, ['Chiplet Architectures', 'Die-to-Die Interconnects']),
        T('riscv', 'RISC-V', 1.1, 0.2, ['RISC-V Processors', 'Open-Source Hardware']),
        T('qarch', '量子体系结构', 1.2, 0.2, ['Quantum Computer Architecture', 'Quantum Error Correction']),
        T('mem', '内存系统', 0.9, 0.3, ['Memory Systems', 'Cache Hierarchies']),
        T('sparse', '稀疏计算', 1.2, 0.4, ['Sparse Tensor Acceleration', 'Graph Processing Hardware']),
      ],
      methods: ['Systolic Arrays', 'Near-Memory Processing', 'Chiplet Integration', 'Sparse Dataflow', 'Approximate Computing', 'Photonic Interconnects', 'Cache Partitioning', 'Hardware Prefetching', 'Speculative Execution', 'Quantization-Aware Hardware', 'Silicon Photonics', '3D Stacking'],
    },
    se: {
      id: 'se', name: '软件工程', short: 'SE', compute: 0.4, citeMult: 0.85, grantMult: 1.0,
      need: { idea: 32, exp: 100, write: 38 },
      desc: '代码大模型让这个领域焕发新生。ICSE 两轮投稿，评审以严格著称。',
      venues: ['icse', 'fse', 'ase', 'issta', 'saner', 'icsme', 'tse', 'se_ws'],
      topics: [
        T('codellm', '代码大模型', 2.2, 0.9, ['Code LLMs', 'Code Generation']),
        T('apr', '程序修复', 1.3, 0.5, ['Automated Program Repair', 'Bug Localization']),
        T('testing', '软件测试', 1.0, 0.3, ['Test Generation', 'Regression Testing']),
        T('analysis', '程序分析', 0.9, 0.2, ['Static Analysis', 'Pointer Analysis']),
        T('oss', '开源生态', 0.9, 0.2, ['Open Source Ecosystems', 'Developer Productivity']),
        T('sesmart', '智能合约分析', 0.8, 0.2, ['Smart Contract Analysis', 'Blockchain Software']),
      ],
      methods: ['Large Language Models', 'Mutation Testing', 'Symbolic Execution', 'Program Synthesis', 'Fuzzing', 'Static Analysis', 'Neural Code Search', 'Graph Neural Networks', 'Agentic Workflows', 'Differential Testing', 'Search-Based Testing', 'Abstract Interpretation'],
    },
    graphics: {
      id: 'graphics', name: '图形学', short: 'Graphics', compute: 0.6, citeMult: 0.75, grantMult: 0.95,
      need: { idea: 38, exp: 110, write: 40 },
      desc: 'SIGGRAPH 的 Fast Forward 是一年中最快乐的时光。好看的 Demo 就是一切。',
      venues: ['siggraph', 'sigasia', 'vis', 'cvpr', 'iccv', 'eccv', 'eg', 'pg', 'tog', 'gr_ws'],
      topics: [
        T('nrender', '神经渲染', 1.8, 1.0, ['Neural Rendering', 'Real-Time Rendering']),
        T('sim', '物理仿真', 1.0, 0.6, ['Physics Simulation', 'Fluid Simulation']),
        T('geo', '几何处理', 0.8, 0.3, ['Geometry Processing', 'Mesh Generation']),
        T('anim', '角色动画', 1.2, 0.7, ['Character Animation', 'Motion Synthesis']),
        T('gen3d', '三维生成', 2.0, 1.3, ['3D Generation', 'Text-to-3D']),
        T('visu', '科学可视化', 0.8, 0.3, ['Scientific Visualization', 'Volume Rendering']),
      ],
      methods: ['Neural Radiance Fields', 'Gaussian Splatting', 'Differentiable Rendering', 'the Material Point Method', 'Monte Carlo Path Tracing', 'Diffusion Models', 'Neural Implicit Surfaces', 'Position-Based Dynamics', 'Motion Matching', 'Spectral Geometry', 'Reinforcement Learning', 'Subdivision Surfaces'],
    },
  };

  RS.TITLE_PARTS = {
    templates: ['{Adj} {Method} for {Task}', '{Acr}: {Adj} {Task} via {Method}', 'Towards {Adj} {Task}', 'Rethinking {Task} with {Method}', '{Method} Is All You Need for {Task}', 'When {Method} Meets {Task}', 'Scaling {Method} for {Task}', 'On the {Noun} of {Method} in {Task}', 'Revisiting {Method}: {Adj} {Task}', '{Acr}: {Method} for {Adj} {Task}', 'Beyond {Method}: {Adj} {Task}', 'A Unified Framework for {Task}', '{Acr}: Taming {Task} with {Method}'],
    adj: ['Efficient', 'Scalable', 'Robust', 'Provable', 'Generalizable', 'Adaptive', 'Lightweight', 'Unified', 'Faithful', 'Fast', 'Private', 'Interpretable', 'Practical', 'Zero-Shot', 'Data-Efficient', 'Fine-Grained', 'Holistic'],
    noun: ['Limits', 'Power', 'Robustness', 'Expressivity', 'Pitfalls', 'Generalization', 'Benefits', 'Brittleness'],
    acr: ['FLASH', 'SPARK', 'LUMEN', 'ORCA', 'MAPLE', 'NOVA', 'TITAN', 'ECHO', 'PRISM', 'HALO', 'ATLAS', 'COMET', 'FALCON', 'PANDA', 'LOTUS', 'ZEBRA', 'QUILL', 'RAVEN', 'SIGMA', 'TURBO', 'VORTEX', 'PIXIE', 'MOCHI', 'BOBA', 'DUMPLING', 'TOFU', 'BAOZI', 'WONTON', 'MANGO', 'KIWI', 'OTTER', 'BADGER', 'LYNX', 'NEXUS', 'HELIX', 'ZEPHYR', 'AURORA', 'EMBER', 'GLACIER', 'TEMPO', 'MOSAIC', 'ORBIT', 'PULSAR', 'QUASAR'],
  };
})();
