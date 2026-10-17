/* 研究领域 → 方向 → 子方向、论文等级、论文标题素材（会议期刊在 venues.js） */
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

  // ---------- 研究方向：领域 → 方向 → 子方向 ----------
  // 子方向：[id, 名称, 初始热度, 算力系数（相对所属方向）, 英文研究任务（论文标题里的 {Task}）]
  // 方向：T(id, 名称, 算力需求, 子方向)；方向的热度取子方向的平均
  const T = (id, name, compute, subs) => ({
    id, name, compute,
    subs: subs.map(([sid, sname, heat, c, en]) => ({ id: sid, name: sname, heat, c, en })),
  });

  RS.AREAS = {
    ml: {
      id: 'ml', name: '机器学习', short: 'ML', compute: 1.0, citeMult: 1.4, grantMult: 1.05,
      need: { idea: 35, exp: 90, write: 35 },
      desc: '当下最热门的方向。引用高、基金多，但竞争激烈，而且非常烧显卡。',
      topics: [
        T('llm', '大语言模型', 1.4, [
          ['llm_long', '长上下文', 2.3, 1, ['Long-Context Language Modeling', 'Context Length Extrapolation', 'KV-Cache Compression']],
          ['llm_pre', '预训练与扩展律', 2.2, 1.6, ['LLM Pretraining', 'Scaling Laws', 'Data Mixtures for Pretraining']],
          ['llm_arch', '新型架构', 2, 1.2, ['Mixture-of-Experts Language Models', 'Linear-Time Sequence Models', 'Hybrid Attention Architectures']],
          ['llm_eff', '压缩与量化', 1.9, 0.6, ['LLM Quantization', 'Model Compression', 'Small Language Models']],
          ['llm_ft', '高效微调', 1.7, 0.6, ['Parameter-Efficient Fine-Tuning', 'Instruction Tuning', 'Continual Fine-Tuning']],
        ]),
        T('diffusion', '扩散与生成模型', 1.3, [
          ['diff_flow', '流匹配', 1.8, 1, ['Flow Matching', 'Rectified Flow', 'Optimal Transport Generative Models']],
          ['diff_fast', '采样加速', 1.6, 0.8, ['Fast Diffusion Sampling', 'Consistency Models', 'Diffusion Distillation']],
          ['diff_ctrl', '可控生成', 1.6, 1.2, ['Controllable Generation', 'Guidance for Diffusion Models', 'Reward Fine-Tuning of Diffusion Models']],
          ['diff_disc', '离散扩散', 1.7, 1.4, ['Discrete Diffusion', 'Diffusion Language Models', 'Masked Generative Models']],
          ['diff_theory', '生成模型理论', 1, 0.4, ['Score Estimation', 'Convergence of Diffusion Models', 'Memorization in Generative Models']],
        ]),
        T('rl', '强化学习', 1.0, [
          ['rl_off', '离线强化学习', 1.2, 1, ['Offline Reinforcement Learning', 'Conservative Policy Learning']],
          ['rl_llm', '大模型强化学习', 2.3, 1.4, ['RL for LLM Reasoning', 'Policy Optimization for Language Models', 'Verifiable Rewards']],
          ['rl_model', '世界模型', 1.5, 1.1, ['World Models', 'Model-Based Reinforcement Learning']],
          ['rl_marl', '多智能体', 1, 0.8, ['Multi-Agent Reinforcement Learning', 'Cooperative Multi-Agent Learning']],
          ['rl_explore', '探索与泛化', 0.9, 0.7, ['Exploration in Sparse-Reward Environments', 'Generalization in Reinforcement Learning']],
        ]),
        T('gnn', '图学习', 0.6, [
          ['gnn_tf', '图 Transformer', 1, 1, ['Graph Transformers', 'Positional Encodings for Graphs']],
          ['gnn_mol', '分子图学习', 1.3, 1.2, ['Molecular Property Prediction', 'Molecule Generation', 'Equivariant Graph Networks']],
          ['gnn_fm', '图基础模型', 1.2, 1.2, ['Graph Foundation Models', 'Graph Prompt Learning', 'LLMs on Graphs']],
          ['gnn_theory', '表达能力', 0.8, 0.6, ['Expressive Power of GNNs', 'Oversmoothing', 'Graph Isomorphism Testing']],
        ]),
        T('fl', '联邦学习', 0.6, [
          ['fl_pers', '个性化联邦', 0.8, 1, ['Personalized Federated Learning', 'Heterogeneous Federated Learning']],
          ['fl_comm', '通信高效训练', 0.8, 0.9, ['Communication-Efficient Training', 'Gradient Compression']],
          ['fl_llm', '联邦大模型', 1.2, 1.4, ['Federated Fine-Tuning of LLMs', 'Split Learning']],
          ['fl_robust', '鲁棒聚合', 0.8, 0.7, ['Byzantine-Robust Aggregation', 'Privacy-Preserving Federated Learning']],
        ]),
        T('xai', '可解释性', 0.8, [
          ['xai_mech', '机制可解释性', 1.4, 1, ['Mechanistic Interpretability', 'Circuit Discovery']],
          ['xai_sae', '稀疏自编码器', 1.5, 1.3, ['Sparse Autoencoder Features', 'Dictionary Learning for Interpretability']],
          ['xai_attr', '归因方法', 0.8, 0.8, ['Feature Attribution', 'Data Attribution', 'Saliency Maps']],
          ['xai_concept', '概念解释', 0.9, 0.9, ['Concept-Based Explanations', 'Probing Representations']],
        ]),
        T('opt', '优化', 0.2, [
          ['opt_adapt', '自适应优化器', 1.1, 1, ['Adaptive Optimizers', 'Learning Rate Schedules', 'Second-Order Optimization']],
          ['opt_noncvx', '非凸优化', 0.8, 0.8, ['Non-Convex Optimization', 'Escaping Saddle Points']],
          ['opt_dist', '分布式优化', 0.8, 1.4, ['Decentralized Optimization', 'Asynchronous SGD']],
          ['opt_minmax', '极小极大优化', 0.7, 0.8, ['Minimax Optimization', 'Variational Inequalities']],
        ]),
        T('align', 'AI 对齐与安全', 1.1, [
          ['al_pref', '偏好对齐', 1.9, 1, ['Preference Optimization', 'Reward Modeling', 'Learning from Human Feedback']],
          ['al_red', '红队与越狱防御', 1.5, 0.8, ['Red Teaming', 'Jailbreak Defenses', 'Adversarial Robustness']],
          ['al_over', '可扩展监督', 1.3, 1.2, ['Scalable Oversight', 'Weak-to-Strong Generalization']],
          ['al_ood', '分布外泛化', 1, 1, ['Robustness to Distribution Shift', 'Out-of-Distribution Detection', 'Uncertainty Quantification']],
        ]),
        T('sci', 'AI for Science', 1.0, [
          ['sci_bio', '蛋白质与药物', 1.6, 1, ['Protein Design', 'Drug Discovery', 'Protein Structure Prediction']],
          ['sci_pde', '神经 PDE 求解', 1.2, 0.8, ['Neural PDE Solvers', 'Neural Operators', 'Physics-Informed Neural Networks']],
          ['sci_weather', '气象与地球科学', 1.3, 1.3, ['Weather Forecasting', 'Climate Emulation']],
          ['sci_mat', '材料与化学', 1.1, 0.9, ['Materials Discovery', 'Crystal Structure Generation', 'Machine-Learned Interatomic Potentials']],
        ]),
      ],
      methods: ['Sparse Attention', 'Mixture-of-Experts', 'Contrastive Learning', 'Low-Rank Adaptation', 'Knowledge Distillation', 'Bayesian Deep Learning', 'Meta-Learning', 'Self-Supervised Pretraining', 'Test-Time Scaling', 'State Space Models', 'Flow Matching', 'Preference Optimization'],
    },
    cv: {
      id: 'cv', name: '计算机视觉', short: 'CV', compute: 1.0, citeMult: 1.35, grantMult: 1.0,
      need: { idea: 35, exp: 95, write: 32 },
      desc: '顶会论文数量巨大，引用可观；数据和显卡都很重要。',
      topics: [
        T('3d', '三维视觉', 1.0, [
          ['3d_gs', '高斯溅射', 1.9, 1, ['Gaussian Splatting', 'Real-Time Radiance Fields']],
          ['3d_nvs', '新视角合成', 1.4, 1.1, ['Novel View Synthesis', 'Sparse-View Reconstruction']],
          ['3d_dyn', '动态场景重建', 1.5, 1.2, ['Dynamic Scene Reconstruction', '4D Reconstruction']],
          ['3d_mvs', '多视图几何', 1, 0.8, ['Multi-View Stereo', 'Structure from Motion', 'Feed-Forward 3D Reconstruction']],
          ['3d_pc', '点云理解', 0.9, 0.9, ['Point Cloud Understanding', '3D Scene Understanding']],
        ]),
        T('videogen', '视频生成', 1.6, [
          ['vg_t2v', '文生视频', 2.1, 1, ['Text-to-Video Synthesis', 'Video Diffusion Models']],
          ['vg_long', '长视频生成', 1.7, 1.1, ['Long Video Generation', 'Autoregressive Video Generation']],
          ['vg_ctrl', '可控视频生成', 1.6, 0.9, ['Camera-Controlled Video Synthesis', 'Motion-Controllable Video Generation']],
          ['vg_world', '视频世界模型', 1.9, 1.2, ['Video World Models', 'Interactive Video Generation']],
          ['vg_edit', '视频编辑', 1.2, 0.8, ['Video Editing', 'Video Inpainting']],
        ]),
        T('det', '检测与分割', 0.9, [
          ['det_ov', '开放词表检测', 1.1, 1, ['Open-Vocabulary Object Detection', 'Open-World Detection']],
          ['det_seg', '通用分割', 1.3, 1, ['Promptable Segmentation', 'Panoptic Segmentation', 'Instance Segmentation']],
          ['det_track', '目标跟踪', 0.9, 1, ['Multi-Object Tracking', 'Video Object Segmentation']],
          ['det_ground', '视觉定位', 1, 1, ['Referring Expression Grounding', 'Visual Grounding']],
        ]),
        T('ad', '自动驾驶', 1.1, [
          ['ad_bev', 'BEV 感知', 1.2, 1, ["Bird's-Eye-View Perception", 'Multi-Camera 3D Detection']],
          ['ad_occ', '占用预测', 1.2, 1, ['Occupancy Prediction', 'Semantic Scene Completion']],
          ['ad_e2e', '端到端驾驶', 1.6, 1.1, ['End-to-End Autonomous Driving', 'Motion Planning for Driving']],
          ['ad_sim', '驾驶仿真', 1.2, 0.9, ['Driving Scene Simulation', 'Closed-Loop Driving Evaluation']],
        ]),
        T('med', '医学影像', 0.7, [
          ['med_seg', '医学图像分割', 1, 1, ['Medical Image Segmentation', 'Organ Segmentation']],
          ['med_path', '计算病理', 1.1, 1.1, ['Computational Pathology', 'Whole-Slide Image Analysis']],
          ['med_report', '影像报告生成', 1.3, 1.1, ['Radiology Report Generation', 'Medical Vision-Language Models']],
          ['med_recon', '医学成像重建', 0.8, 0.8, ['MRI Reconstruction', 'Low-Dose CT Reconstruction']],
        ]),
        T('vlm', '多模态大模型', 1.4, [
          ['vlm_mllm', '多模态大模型', 2.2, 1, ['Multimodal Large Language Models', 'Visual Instruction Tuning']],
          ['vlm_halluc', '多模态幻觉', 1.5, 0.6, ['Object Hallucination', 'Multimodal Hallucination']],
          ['vlm_video', '视频理解', 1.7, 1.1, ['Long Video Understanding', 'Video Question Answering']],
          ['vlm_clip', '图文预训练', 1.1, 1, ['Language-Image Pretraining', 'Zero-Shot Image Classification']],
          ['vlm_unify', '理解生成一体化', 1.9, 1.3, ['Unified Multimodal Models', 'Any-to-Any Generation']],
        ]),
        T('edit', '图像生成与编辑', 1.0, [
          ['im_edit', '图像编辑', 1.3, 1, ['Instruction-Based Image Editing', 'Image Inpainting']],
          ['im_t2i', '文生图', 1.6, 1.3, ['Text-to-Image Generation', 'Image Diffusion Models']],
          ['im_pers', '个性化生成', 1.2, 1, ['Personalized Text-to-Image Generation', 'Subject-Driven Generation']],
          ['im_restore', '图像复原', 0.9, 0.7, ['Image Super-Resolution', 'Image Restoration', 'Low-Light Enhancement']],
        ]),
        T('pose', '人体与动作', 0.8, [
          ['pose_est', '姿态估计', 0.9, 1, ['Human Pose Estimation', 'Whole-Body Pose Estimation']],
          ['pose_mesh', '人体重建', 1.1, 1.1, ['Human Mesh Recovery', 'Clothed Human Reconstruction']],
          ['pose_hand', '手与交互', 1.1, 1, ['Hand Pose Estimation', 'Hand-Object Interaction']],
          ['pose_motion', '动作生成', 1.3, 1.1, ['Human Motion Generation', 'Text-to-Motion Synthesis']],
          ['pose_act', '动作识别', 0.8, 0.8, ['Action Recognition', 'Temporal Action Localization']],
        ]),
      ],
      methods: ['Vision Transformers', 'Gaussian Splatting', 'Neural Fields', 'Masked Autoencoders', 'Diffusion Priors', 'Optical Flow', 'Point Transformers', 'Language-Image Pretraining', 'Implicit Representations', 'Video Diffusion', 'Token Merging', 'Feature Distillation'],
    },
    nlp: {
      id: 'nlp', name: '自然语言处理', short: 'NLP', compute: 1.1, citeMult: 1.35, grantMult: 1.05,
      need: { idea: 35, exp: 85, write: 38 },
      desc: '大模型时代的风口浪尖，热点切换极快，一不小心就被撞车。',
      topics: [
        T('reason', '大模型推理', 1.3, [
          ['re_math', '数学推理', 2.2, 1, ['Mathematical Reasoning', 'Theorem Proving with LLMs']],
          ['re_tts', '测试时扩展', 2.3, 1.3, ['Test-Time Scaling', 'Process Reward Models', 'Reasoning Efficiency']],
          ['re_cot', '思维链', 1.9, 0.9, ['Chain-of-Thought Reasoning', 'Long Chain-of-Thought']],
          ['re_logic', '逻辑与常识推理', 1, 0.8, ['Logical Reasoning', 'Commonsense Reasoning']],
        ]),
        T('rag', '检索增强生成', 0.9, [
          ['rag_retr', '稠密检索', 1.6, 1, ['Dense Retrieval', 'Text Embedding Models']],
          ['rag_deep', '深度研究智能体', 1.9, 1.2, ['Deep Research Agents', 'Search-Augmented Reasoning']],
          ['rag_graph', '图检索增强', 1.5, 0.9, ['Graph-Based Retrieval-Augmented Generation', 'Knowledge Graph Retrieval']],
          ['rag_qa', '开放域问答', 1.1, 0.9, ['Open-Domain Question Answering', 'Long-Document Question Answering']],
        ]),
        T('agent', '智能体', 1.1, [
          ['ag_tool', '工具调用', 2, 1, ['Tool Use', 'Function Calling']],
          ['ag_web', '网页与 GUI 智能体', 2.2, 1.1, ['Web Agents', 'GUI Agents', 'Computer-Use Agents']],
          ['ag_multi', '多智能体协作', 1.7, 1, ['Multi-Agent Collaboration', 'Multi-Agent Debate']],
          ['ag_mem', '记忆与规划', 1.5, 0.9, ['Agent Memory', 'Long-Horizon Planning']],
          ['ag_sim', '社会模拟', 1.2, 1, ['Generative Agents', 'LLM-Based Social Simulation']],
        ]),
        T('mt', '机器翻译', 0.8, [
          ['mt_llm', '大模型翻译', 0.9, 1, ['LLM-Based Machine Translation', 'Translation Quality Estimation']],
          ['mt_low', '低资源翻译', 0.8, 0.8, ['Low-Resource Translation', 'Unsupervised Machine Translation']],
          ['mt_speech', '语音翻译', 0.9, 1.3, ['Speech Translation', 'Simultaneous Translation']],
          ['mt_doc', '篇章翻译', 0.7, 0.9, ['Document-Level Translation', 'Literary Translation']],
        ]),
        T('dialog', '对话系统', 0.8, [
          ['dl_persona', '角色扮演', 1.2, 1, ['Role-Playing Agents', 'Persona-Grounded Conversation']],
          ['dl_speech', '语音大模型', 1.6, 1.4, ['Spoken Language Models', 'Full-Duplex Spoken Dialogue']],
          ['dl_task', '任务型对话', 0.8, 0.8, ['Task-Oriented Dialogue', 'Dialogue State Tracking']],
          ['dl_emo', '情感对话', 0.9, 0.8, ['Empathetic Dialogue', 'Emotional Support Conversation']],
        ]),
        T('eval', '评测基准', 0.7, [
          ['ev_bench', '评测基准构建', 1.4, 1, ['Benchmarking LLMs', 'LLM Evaluation']],
          ['ev_judge', 'LLM 当评委', 1.4, 1.2, ['LLM-as-a-Judge', 'Automatic Evaluation']],
          ['ev_contam', '数据污染', 1, 1, ['Benchmark Contamination', 'Data Leakage Detection']],
          ['ev_human', '人工评测', 0.9, 0.8, ['Human Evaluation', 'Annotation Disagreement']],
        ]),
        T('multi', '多语言', 0.8, [
          ['mu_cross', '跨语言迁移', 0.9, 1, ['Cross-Lingual Transfer', 'Multilingual Pretraining']],
          ['mu_low', '低资源语言', 0.9, 0.9, ['Low-Resource Languages', 'Language Documentation']],
          ['mu_culture', '文化对齐', 1.1, 1, ['Cultural Alignment', 'Multilingual Safety']],
          ['mu_cs', '语码转换与方言', 0.6, 0.9, ['Code-Switching', 'Dialect Processing']],
        ]),
        T('halluc', '幻觉与事实性', 0.8, [
          ['ha_detect', '幻觉检测', 1.6, 1, ['Hallucination Detection', 'Uncertainty Estimation in LLMs']],
          ['ha_edit', '知识编辑', 1.3, 1, ['Knowledge Editing', 'Knowledge Conflicts']],
          ['ha_fact', '事实核查', 1.1, 0.9, ['Fact Verification', 'Claim Detection']],
          ['ha_cite', '引用与溯源', 1.1, 1.1, ['Attributed Text Generation', 'Citation Generation', 'Faithful Summarization']],
        ]),
      ],
      methods: ['Chain-of-Thought Prompting', 'Retrieval Augmentation', 'Instruction Tuning', 'Preference Optimization', 'Speculative Decoding', 'Contrastive Decoding', 'Self-Consistency', 'Knowledge Editing', 'Multi-Agent Debate', 'Process Reward Models', 'Long-Context Attention', 'Synthetic Data'],
    },
    sys: {
      id: 'sys', name: '计算机系统', short: 'Systems', compute: 0.45, citeMult: 0.8, grantMult: 1.05,
      need: { idea: 30, exp: 125, write: 35 },
      desc: '工程量巨大，一篇顶会要写很多代码；论文少而精，工业界认可度高。',
      topics: [
        T('serving', 'LLM 推理服务', 1.4, [
          ['sv_kv', 'KV 缓存管理', 2, 1, ['KV-Cache Management', 'Prefix Caching']],
          ['sv_disagg', '预填充与解码分离', 1.8, 1.2, ['Prefill-Decode Disaggregation', 'Disaggregated LLM Serving']],
          ['sv_sched', '请求调度', 1.6, 1, ['LLM Request Scheduling', 'Multi-Tenant LLM Serving']],
          ['sv_spec', '投机解码系统', 1.5, 1, ['Speculative Decoding Systems', 'Inference Acceleration']],
          ['sv_edge', '端侧推理', 1.3, 0.8, ['On-Device LLM Inference', 'Mobile Inference Engines']],
        ]),
        T('dtrain', '分布式训练', 1.5, [
          ['dt_par', '并行策略', 1.5, 1, ['Pipeline Parallelism', 'Tensor Parallelism', 'Automatic Parallelization']],
          ['dt_moe', 'MoE 训练', 1.6, 1.2, ['Mixture-of-Experts Training', 'Expert Parallelism']],
          ['dt_rl', '强化学习后训练系统', 1.7, 1.1, ['RL Post-Training Systems', 'Rollout Generation Systems']],
          ['dt_ft', '容错与检查点', 1.2, 0.8, ['Fault-Tolerant Training', 'Checkpointing']],
          ['dt_comm', '集合通信', 1.1, 0.9, ['Collective Communication', 'Gradient Synchronization']],
        ]),
        T('storage', '存储系统', 0.3, [
          ['st_kv', '键值存储', 0.9, 1, ['Key-Value Stores', 'Log-Structured Merge Trees']],
          ['st_ai', 'AI 数据存储', 1.3, 1.2, ['Storage for ML Training', 'Data Loading Pipelines']],
          ['st_flash', '闪存与 SSD', 0.8, 0.9, ['Flash Storage', 'Zoned Namespace SSDs']],
          ['st_fs', '文件系统', 0.8, 0.9, ['File Systems', 'Crash Consistency']],
        ]),
        T('os', '操作系统', 0.2, [
          ['os_kernel', '内核设计', 0.8, 1, ['Operating System Kernels', 'Microkernels']],
          ['os_ebpf', '内核扩展', 1, 1, ['Kernel Extensions', 'eBPF Programs']],
          ['os_rust', '内存安全系统', 1, 1, ['Rust for Systems Programming', 'Memory-Safe Kernels']],
          ['os_virt', '虚拟化', 0.8, 1.2, ['Virtualization', 'Lightweight Virtual Machines']],
          ['os_verify', '系统验证', 0.9, 0.8, ['Verified Systems', 'Formal Verification of Systems Software']],
        ]),
        T('serverless', 'Serverless 与云', 0.4, [
          ['sl_cold', '冷启动', 0.9, 1, ['Cold Start Mitigation', 'Function Snapshots']],
          ['sl_ai', 'Serverless AI', 1.3, 1.3, ['Serverless Inference', 'Serverless GPU Computing']],
          ['sl_edge', '边缘计算', 0.9, 0.9, ['Edge Computing', 'Edge-Cloud Collaboration']],
          ['sl_cost', '云成本优化', 0.8, 0.8, ['Cloud Cost Optimization', 'Spot Instances']],
        ]),
        T('sched', '集群与资源管理', 0.8, [
          ['sc_gpu', 'GPU 集群调度', 1.3, 1, ['GPU Cluster Management', 'Deep Learning Job Scheduling']],
          ['sc_dc', '数据中心资源管理', 0.9, 1, ['Datacenter Resource Management', 'Workload Colocation']],
          ['sc_green', '绿色计算', 1, 1, ['Carbon-Aware Computing', 'Power Management']],
          ['sc_rel', '故障诊断', 1, 1, ['Failure Diagnosis', 'Incident Management in the Cloud']],
        ]),
        T('cxl', '内存与互连', 0.4, [
          ['cx_tier', '分层内存', 1.1, 1, ['Tiered Memory', 'Memory Tiering Policies']],
          ['cx_far', '远端内存', 1, 1, ['Far Memory', 'Memory Disaggregation']],
          ['cx_cxl', 'CXL 系统', 1.2, 1, ['CXL Memory', 'CXL-Based Shared Memory']],
          ['cx_rdma', 'RDMA 系统', 0.9, 1, ['RDMA Systems', 'Kernel-Bypass Networking']],
        ]),
        T('compiler', 'ML 编译器', 0.9, [
          ['cp_tensor', '张量编译', 1.3, 1, ['Tensor Program Optimization', 'Auto-Tuning']],
          ['cp_dsl', '内核编程语言', 1.3, 0.9, ['GPU Kernel DSLs', 'Tile-Based Programming']],
          ['cp_llm', '大模型写内核', 1.6, 1.2, ['LLM-Generated GPU Kernels', 'Learned Compiler Optimization']],
          ['cp_fusion', '算子融合', 1.1, 0.9, ['Kernel Fusion', 'Operator Scheduling']],
        ]),
      ],
      methods: ['Disaggregated Memory', 'Kernel Bypass', 'Lock-Free Data Structures', 'Adaptive Batching', 'Paged Attention', 'Learned Indexes', 'RDMA', 'eBPF', 'Persistent Memory', 'Elastic Scheduling', 'Unikernels', 'Speculative Execution'],
    },
    sec: {
      id: 'sec', name: '网络与信息安全', short: 'Security', compute: 0.3, citeMult: 0.85, grantMult: 1.1,
      need: { idea: 35, exp: 95, write: 38 },
      desc: '四大顶会一年多轮投稿，攻防对抗永不过时，政府基金偏爱。',
      topics: [
        T('fuzz', '模糊测试', 0.4, [
          ['fz_kernel', '内核模糊测试', 1.1, 1, ['Kernel Fuzzing', 'Hypervisor Fuzzing']],
          ['fz_llm', '大模型辅助模糊测试', 1.4, 1.2, ['LLM-Assisted Fuzzing', 'Fuzz Driver Generation']],
          ['fz_proto', '协议模糊测试', 0.9, 0.9, ['Protocol Fuzzing', 'Network Service Fuzzing']],
          ['fz_dir', '定向模糊测试', 0.9, 0.9, ['Directed Greybox Fuzzing', 'Vulnerability Discovery']],
        ]),
        T('side', '侧信道与硬件安全', 0.2, [
          ['sd_trans', '瞬态执行攻击', 1.0, 1.0, ['Transient Execution Attacks', 'Spectre Mitigations']],
          ['sd_tee', '可信执行环境', 1.1, 1.0, ['Trusted Execution Environments', 'Confidential Computing']],
          ['sd_rh', 'Rowhammer', 0.9, 1.0, ['Rowhammer Attacks', 'DRAM Disturbance Errors']],
          ['sd_phys', '物理侧信道', 0.8, 1.0, ['Power Side Channels', 'Electromagnetic Side Channels']],
        ]),
        T('privacy', '隐私计算', 0.4, [
          ['pv_dp', '差分隐私', 1.1, 1, ['Differential Privacy', 'Private Data Release']],
          ['pv_ml', '机器学习隐私', 1.3, 1.3, ['Membership Inference', 'Machine Unlearning', 'Training Data Extraction']],
          ['pv_mpc', '安全多方计算', 1, 0.8, ['Secure Multi-Party Computation', 'Private Set Intersection']],
          ['pv_fhe', '同态加密', 1.1, 0.9, ['Fully Homomorphic Encryption', 'Private Inference']],
        ]),
        T('llmsec', '大模型安全', 0.9, [
          ['ls_jail', '越狱攻击', 2.1, 1, ['Jailbreak Attacks', 'Safety Alignment Bypass']],
          ['ls_inject', '提示注入', 1.9, 0.9, ['Prompt Injection', 'Agent Hijacking']],
          ['ls_agent', '智能体安全', 2.1, 1, ['Agent Security', 'Tool-Use Safety']],
          ['ls_wm', '水印与溯源', 1.4, 0.9, ['LLM Watermarking', 'AI-Generated Content Detection']],
          ['ls_backdoor', '后门与投毒', 1.4, 1.2, ['Backdoor Attacks on LLMs', 'Data Poisoning']],
        ]),
        T('chain', '区块链安全', 0.2, [
          ['ch_sc', '智能合约漏洞', 0.8, 1.0, ['Smart Contract Vulnerabilities', 'Smart Contract Auditing']],
          ['ch_defi', 'DeFi 攻击', 0.9, 1.0, ['DeFi Attacks', 'Price Oracle Manipulation']],
          ['ch_mev', 'MEV', 0.8, 1.0, ['MEV Extraction', 'Front-Running Attacks']],
          ['ch_bridge', '跨链与共识安全', 0.8, 1.0, ['Cross-Chain Bridges', 'Consensus Security']],
        ]),
        T('malware', '恶意软件与系统安全', 0.5, [
          ['mw_detect', '恶意软件检测', 0.8, 1, ['Malware Detection', 'Ransomware Detection']],
          ['mw_binary', '二进制分析', 0.9, 0.9, ['Binary Analysis', 'Binary Code Similarity', 'Decompilation']],
          ['mw_android', '移动安全', 0.8, 0.9, ['Android Malware', 'Mobile App Privacy']],
          ['mw_apt', '入侵检测', 0.9, 1.2, ['Intrusion Detection', 'Provenance-Based Attack Detection']],
        ]),
        T('supply', '供应链安全', 0.3, [
          ['sp_pkg', '软件包生态', 1.2, 1, ['Software Supply Chain Security', 'Malicious Packages']],
          ['sp_ai', 'AI 模型供应链', 1.3, 1.2, ['Model Supply Chain Security', 'Malicious Model Files']],
          ['sp_vuln', '漏洞管理', 0.9, 0.9, ['Vulnerability Management', 'Silent Security Patches']],
          ['sp_build', '可复现构建', 0.8, 0.9, ['Reproducible Builds', 'Build Integrity']],
        ]),
      ],
      methods: ['Grey-Box Fuzzing', 'Symbolic Execution', 'Differential Privacy', 'Homomorphic Encryption', 'Trusted Execution Environments', 'Taint Analysis', 'Control-Flow Integrity', 'Zero-Knowledge Proofs', 'Adversarial Prompting', 'Binary Lifting', 'Memory Tagging', 'Formal Verification'],
    },
    theory: {
      id: 'theory', name: '理论计算机', short: 'Theory', compute: 0.0, citeMult: 0.45, grantMult: 0.9,
      need: { idea: 70, exp: 45, write: 50 },
      desc: '不需要显卡，只需要纸和笔（和咖啡）。证明一个定理可能要好几年。',
      topics: [
        T('approx', '近似算法', 0, [
          ['ap_cluster', '聚类', 1, 1, ['k-Means Clustering', 'Facility Location']],
          ['ap_sub', '子模优化', 0.9, 1, ['Submodular Maximization', 'Matroid Constraints']],
          ['ap_lp', '线性规划松弛', 0.8, 1, ['LP Rounding', 'Integrality Gaps']],
          ['ap_net', '网络设计', 0.8, 1, ['Network Design', 'Steiner Trees']],
        ]),
        T('complex', '计算复杂性', 0, [
          ['cc_fine', '细粒度复杂性', 1.0, 1, ['Fine-Grained Complexity', 'Conditional Lower Bounds']],
          ['cc_lb', '电路下界', 0.8, 1, ['Circuit Lower Bounds', 'Algebraic Complexity']],
          ['cc_pcp', '近似难度', 0.9, 1, ['Hardness of Approximation', 'Probabilistically Checkable Proofs']],
          ['cc_proof', '证明复杂性', 0.7, 1, ['Proof Complexity', 'Lower Bounds for SAT Solvers']],
        ]),
        T('online', '在线算法', 0, [
          ['on_pred', '学习增强算法', 1.2, 1, ['Online Learning with Predictions', 'Learning-Augmented Algorithms']],
          ['on_match', '在线匹配', 0.9, 1, ['Online Matching', 'Online Bipartite Matching']],
          ['on_sec', '秘书问题', 0.8, 1, ['Secretary Problems', 'Prophet Inequalities']],
          ['on_sched', '在线调度', 0.7, 1, ['Online Scheduling', 'Caching and Paging']],
        ]),
        T('graph', '图算法', 0, [
          ['gr_flow', '最大流', 1.0, 1, ['Maximum Flow', 'Minimum-Cost Flow']],
          ['gr_sp', '最短路', 0.9, 1, ['Shortest Paths', 'Distance Oracles']],
          ['gr_dyn', '动态图算法', 0.9, 1, ['Dynamic Graph Algorithms', 'Graph Sparsification']],
          ['gr_dist', '分布式图算法', 0.8, 1, ['Distributed Graph Algorithms', 'Local Algorithms']],
        ]),
        T('quantum', '量子计算', 0, [
          ['qu_alg', '量子算法', 1.5, 1, ['Quantum Algorithms', 'Quantum Advantage']],
          ['qu_qec', '量子纠错', 1.4, 1, ['Quantum Error Correction', 'Fault-Tolerant Quantum Computation']],
          ['qu_learn', '量子学习理论', 1.1, 1, ['Quantum Learning Theory', 'Quantum State Tomography']],
          ['qu_comp', '量子复杂性', 1, 1, ['Quantum Query Complexity', 'Quantum Complexity Theory']],
        ]),
        T('crypto', '密码学基础', 0, [
          ['cr_lattice', '格密码', 1.1, 1, ['Lattice-Based Cryptography', 'Learning with Errors']],
          ['cr_zk', '零知识证明', 1.2, 1, ['Zero-Knowledge Proofs', 'Succinct Arguments']],
          ['cr_pq', '后量子密码', 1.1, 1, ['Post-Quantum Cryptography', 'Quantum-Secure Reductions']],
          ['cr_io', '不可区分混淆', 0.8, 1, ['Indistinguishability Obfuscation', 'Functional Encryption']],
        ]),
        T('agt', '算法博弈论', 0, [
          ['gt_mech', '机制设计', 0.9, 1, ['Mechanism Design', 'Auctions']],
          ['gt_fair', '公平分配', 0.9, 1, ['Fair Division', 'Envy-Free Allocation']],
          ['gt_info', '信息设计', 0.8, 1, ['Information Design', 'Bayesian Persuasion']],
          ['gt_social', '计算社会选择', 0.8, 1, ['Computational Social Choice', 'Voting Rules']],
        ]),
        T('lt', '学习理论', 0.1, [
          ['lt_gen', '泛化理论', 1.3, 1, ['Generalization Bounds', 'Benign Overfitting']],
          ['lt_tf', 'Transformer 理论', 1.5, 1, ['Theory of Transformers', 'In-Context Learning Theory']],
          ['lt_bandit', '赌博机', 1, 1, ['Multi-Armed Bandits', 'Online Learning']],
          ['lt_pac', 'PAC 学习', 0.9, 1, ['PAC Learning', 'Sample Complexity']],
        ]),
        T('logic', '逻辑与验证', 0, [
          ['lg_mc', '模型检测', 0.9, 1, ['Model Checking', 'Temporal Logic']],
          ['lg_sat', 'SAT/SMT 求解', 1.0, 1, ['SAT Solving', 'SMT Solving']],
          ['lg_auto', '自动机理论', 0.7, 1, ['Automata Theory', 'Weighted Automata']],
          ['lg_atp', '定理证明', 1.1, 1, ['Automated Theorem Proving', 'Interactive Theorem Proving']],
        ]),
      ],
      methods: ['Semidefinite Programming', 'Spectral Methods', 'Expander Graphs', 'Fourier Analysis', 'Sum-of-Squares', 'Random Walks', 'Lattice Reduction', 'the Polynomial Method', 'Interior Point Methods', 'Communication Complexity', 'Online Learning', 'Sketching'],
      templates: ['Near-Optimal Algorithms for {Task}', 'Improved Bounds for {Task} via {Method}', 'A Polynomial-Time Algorithm for {Task}', 'Hardness of {Task}', '{Task}: Tight Bounds and Beyond', 'Faster {Task} via {Method}', 'On the Complexity of {Task}', 'Simple and Optimal {Task}'],
    },
    hci: {
      id: 'hci', name: '人机交互', short: 'HCI', compute: 0.1, citeMult: 0.75, grantMult: 1.0,
      need: { idea: 45, exp: 80, write: 45 },
      desc: '要做用户实验、招募被试，写作要求高；CHI 一年一度的大狂欢。',
      topics: [
        T('xr', 'AR/VR 交互', 0.2, [
          ['xr_input', '交互技术', 1.3, 1, ['Mixed Reality Interaction', 'Gaze-Based Input']],
          ['xr_haptic', '触觉反馈', 1, 1, ['Haptic Feedback', 'Encountered-Type Haptics']],
          ['xr_social', '虚拟社交', 1, 1, ['Social Virtual Reality', 'Avatars and Embodiment']],
          ['xr_loco', '虚拟移动', 0.8, 1, ['Locomotion in Virtual Reality', 'Redirected Walking']],
        ]),
        T('access', '无障碍', 0.1, [
          ['ac_blind', '视障辅助', 1.0, 1.0, ['Screen Reader Interaction', 'Visual Assistance for Blind Users']],
          ['ac_sign', '手语技术', 0.9, 1.0, ['Sign Language Technology', 'Captioning for Deaf Users']],
          ['ac_aging', '老年人与技术', 0.9, 1.0, ['Older Adults and Technology', 'Aging in Place']],
          ['ac_cog', '认知无障碍', 0.8, 1.0, ['Cognitive Accessibility', 'Neurodivergent Users']],
        ]),
        T('vis', '可视化', 0.1, [
          ['vi_ai', '智能可视化', 1.3, 1.0, ['Natural Language Interfaces for Visualization', 'Chart Generation with LLMs']],
          ['vi_va', '可视分析', 1.0, 1.0, ['Visual Analytics', 'Interactive Data Exploration']],
          ['vi_lit', '可视化素养', 0.8, 1.0, ['Visualization Literacy', 'Chart Comprehension']],
          ['vi_nb', '计算笔记本', 0.8, 1.0, ['Notebook Interfaces', 'Data Science Workflows']],
        ]),
        T('haic', '人智协作', 0.4, [
          ['hc_agent', '智能体交互', 1.9, 1, ['Human-Agent Interaction', 'Mixed-Initiative Interfaces']],
          ['hc_write', 'AI 辅助写作', 1.6, 1, ['AI-Assisted Writing', 'Creative Writing Support']],
          ['hc_trust', '信任与依赖', 1.5, 0.8, ['Trust in AI Assistants', 'Overreliance on AI']],
          ['hc_code', '编程助手', 1.5, 1.2, ['Programming Assistants', 'Developer Experience with AI']],
        ]),
        T('wear', '可穿戴与普适计算', 0.1, [
          ['we_health', '健康感知', 1.1, 1.0, ['Health Sensing', 'Mobile Health Interventions']],
          ['we_ctx', '情境感知', 1.0, 1.0, ['Context-Aware Computing', 'Activity Recognition']],
          ['we_ring', '指环与手表', 0.9, 1.0, ['Smart Rings', 'Smartwatch Interaction']],
          ['we_body', '身体交互', 0.9, 1.0, ['On-Body Interaction', 'Electrical Muscle Stimulation']],
        ]),
        T('social', '社会计算', 0.1, [
          ['so_mis', '虚假信息', 1.0, 1.0, ['Misinformation', 'Fact-Checking Interfaces']],
          ['so_mod', '内容审核', 0.9, 1.0, ['Content Moderation', 'Online Harassment']],
          ['so_well', '数字健康', 0.9, 1.0, ['Digital Wellbeing', 'Social Media Use']],
          ['so_comm', '在线社区', 0.8, 1.0, ['Online Communities', 'Creator Economies']],
        ]),
        T('edu', '教育技术', 0.2, [
          ['ed_tutor', 'AI 导师', 1.4, 1.0, ['AI Tutors', 'Intelligent Tutoring Systems']],
          ['ed_prog', '编程教育', 1.0, 1.0, ['Programming Education', 'Novice Programmers']],
          ['ed_scale', '大规模学习', 0.8, 1.0, ['Learning at Scale', 'MOOC Engagement']],
          ['ed_class', '课堂编排', 0.8, 1.0, ['Classroom Orchestration', 'Collaborative Learning']],
        ]),
      ],
      methods: ['a Mixed-Methods Study', 'Large-Scale Field Deployment', 'Participatory Design', 'Eye Tracking', 'Haptic Feedback', 'LLM-Powered Interfaces', 'Design Probes', 'Crowdsourcing', 'Wizard-of-Oz Study', 'Interactive Visualization', 'Gesture Recognition', 'Conversational Agents'],
      templates: ['{Acr}: Supporting {Task} with {Method}', 'Understanding {Task} through {Method}', 'Designing for {Task}', '"It Just Works": {Task} in the Wild', 'Exploring {Task} through {Method}', '{Acr}: {Adj} {Task} for Everyone', 'Beyond the Screen: {Task}'],
    },
    robo: {
      id: 'robo', name: '机器人', short: 'Robotics', compute: 0.6, citeMult: 0.95, grantMult: 1.1,
      need: { idea: 35, exp: 115, write: 32 },
      desc: '具身智能正当红。需要真机实验，硬件经常坏，Demo 视频决定一切。',
      topics: [
        T('embodied', '具身智能', 1.2, [
          ['em_vla', 'VLA 模型', 2.3, 1, ['Vision-Language-Action Models', 'Generalist Robot Policies']],
          ['em_wm', '机器人世界模型', 1.9, 1.2, ['World Models for Robotics', 'Video Prediction for Planning']],
          ['em_nav', '视觉语言导航', 1.3, 0.9, ['Vision-Language Navigation', 'Object-Goal Navigation']],
          ['em_eqa', '具身问答', 1.1, 0.9, ['Embodied Question Answering', 'Embodied Reasoning']],
        ]),
        T('manip', '机械臂操作', 0.8, [
          ['mp_dex', '灵巧手', 1.5, 1, ['Dexterous Manipulation', 'In-Hand Manipulation']],
          ['mp_bi', '双臂与移动操作', 1.3, 1.1, ['Bimanual Manipulation', 'Mobile Manipulation']],
          ['mp_deform', '柔性物体操作', 1.1, 1, ['Deformable Object Manipulation', 'Cloth Manipulation']],
          ['mp_tactile', '触觉感知', 1.1, 1, ['Tactile Sensing', 'Visuotactile Manipulation']],
          ['mp_grasp', '抓取', 0.9, 0.9, ['Robotic Grasping', '6-DoF Grasp Detection']],
        ]),
        T('legged', '足式机器人', 0.7, [
          ['lg_loco', '运动控制', 1.2, 1, ['Legged Locomotion', 'Terrain-Aware Locomotion']],
          ['lg_park', '敏捷运动', 1.3, 1, ['Parkour Locomotion', 'Agile Locomotion']],
          ['lg_lm', '足式移动操作', 1.1, 1, ['Loco-Manipulation', 'Quadruped Manipulation']],
          ['lg_s2r', '仿真到现实', 1, 1, ['Sim-to-Real Transfer', 'Domain Randomization']],
        ]),
        T('slam', 'SLAM 与建图', 0.4, [
          ['sm_vis', '视觉 SLAM', 0.8, 1, ['Visual SLAM', 'Visual-Inertial Odometry']],
          ['sm_neural', '神经 SLAM', 1.2, 1.3, ['Neural SLAM', 'Gaussian Splatting SLAM']],
          ['sm_sem', '语义建图', 1, 1, ['Semantic Mapping', '3D Scene Graphs']],
          ['sm_lidar', '激光 SLAM', 0.7, 0.7, ['Lidar Odometry', 'Place Recognition']],
        ]),
        T('humanoid', '人形机器人', 1.0, [
          ['hm_wbc', '全身控制', 2, 1, ['Whole-Body Control', 'Humanoid Locomotion']],
          ['hm_imit', '从人类视频学习', 1.7, 1.2, ['Learning from Human Videos', 'Human-to-Humanoid Transfer']],
          ['hm_tele', '遥操作', 1.4, 1, ['Humanoid Teleoperation', 'Motion Retargeting for Robots']],
          ['hm_hw', '硬件与驱动', 1, 0.8, ['Humanoid Hardware Design', 'Actuator Design']],
        ]),
        T('il', '模仿学习', 0.9, [
          ['il_diff', '扩散策略', 1.6, 1, ['Diffusion Policies', 'Action Chunking']],
          ['il_cross', '跨本体迁移', 1.4, 1.2, ['Cross-Embodiment Transfer', 'Robot Foundation Models']],
          ['il_data', '数据采集', 1.3, 0.9, ['Teleoperation Data Collection', 'Learning from Play']],
          ['il_irl', '逆强化学习', 0.8, 0.9, ['Inverse Reinforcement Learning', 'Reward Learning from Demonstrations']],
        ]),
        T('plan', '运动规划', 0.3, [
          ['pn_tamp', '任务与运动规划', 1, 1, ['Task and Motion Planning', 'Long-Horizon Manipulation Planning']],
          ['pn_llm', '大模型任务规划', 1.4, 1.3, ['LLM-Based Task Planning', 'Language-Conditioned Planning']],
          ['pn_traj', '轨迹优化', 0.8, 0.8, ['Trajectory Optimization', 'Model Predictive Control']],
          ['pn_multi', '多机器人协同', 0.9, 0.9, ['Multi-Robot Coordination', 'Swarm Robotics']],
        ]),
      ],
      methods: ['Diffusion Policies', 'Sim-to-Real Transfer', 'Model Predictive Control', 'Vision-Language-Action Models', 'Tactile Sensing', 'Reinforcement Learning', 'Imitation Learning', 'Neural SLAM', 'Whole-Body Control', 'World Models', 'Teleoperation Data', 'Foundation Models'],
    },
    db: {
      id: 'db', name: '数据库与数据挖掘', short: 'DB/DM', compute: 0.4, citeMult: 0.95, grantMult: 1.0,
      need: { idea: 32, exp: 100, write: 35 },
      desc: 'SIGMOD/VLDB 一年多轮投稿，节奏稳定；工业界合作机会多。',
      topics: [
        T('vecdb', '向量数据库', 0.5, [
          ['vd_ann', '近似最近邻搜索', 1.6, 1, ['Approximate Nearest Neighbor Search', 'Graph-Based Vector Indexes']],
          ['vd_filter', '过滤与混合检索', 1.3, 1, ['Filtered Vector Search', 'Hybrid Search']],
          ['vd_sys', '向量数据库系统', 1.4, 1.1, ['Vector Database Systems', 'Disk-Based Vector Search']],
          ['vd_quant', '向量量化', 1, 0.9, ['Vector Quantization', 'Product Quantization']],
        ]),
        T('qo', '查询优化', 0.3, [
          ['qo_card', '基数估计', 1, 1, ['Cardinality Estimation', 'Learned Cardinality Estimation']],
          ['qo_rewrite', '查询重写', 1.1, 1.1, ['Query Rewriting', 'LLM-Based Query Optimization']],
          ['qo_join', '连接优化', 0.8, 0.9, ['Join Ordering', 'Worst-Case Optimal Joins']],
          ['qo_tune', '自动调优', 0.9, 1, ['Index Tuning', 'Learned Database Tuning']],
        ]),
        T('rec', '推荐系统', 0.8, [
          ['rc_seq', '序列推荐', 1.1, 1, ['Sequential Recommendation', 'Session-Based Recommendation']],
          ['rc_gen', '生成式推荐', 1.7, 1.2, ['Generative Recommendation', 'LLM-Based Recommendation']],
          ['rc_ctr', '点击率预估', 1, 1.1, ['Click-Through Rate Prediction', 'Multi-Task Ranking']],
          ['rc_fair', '去偏与公平', 0.9, 0.7, ['Debiasing Recommender Systems', 'Fairness in Recommendation']],
        ]),
        T('gmine', '图数据挖掘', 0.5, [
          ['gm_kg', '知识图谱', 1, 1, ['Knowledge Graph Completion', 'Knowledge Graph Reasoning']],
          ['gm_anom', '图异常检测', 1, 1.1, ['Graph Anomaly Detection', 'Fraud Detection']],
          ['gm_sub', '子图匹配', 0.8, 0.9, ['Subgraph Matching', 'Graph Pattern Mining']],
          ['gm_dense', '稠密子图与社区', 0.8, 1, ['Dense Subgraph Discovery', 'Community Detection']],
        ]),
        T('ts', '时序与时空数据', 0.6, [
          ['ts_fc', '时序预测', 1.1, 1, ['Time Series Forecasting', 'Long-Term Forecasting']],
          ['ts_fm', '时序基础模型', 1.6, 1.3, ['Time Series Foundation Models', 'Zero-Shot Forecasting']],
          ['ts_st', '时空数据挖掘', 1.1, 1, ['Spatio-Temporal Forecasting', 'Traffic Prediction']],
          ['ts_anom', '时序异常检测', 1, 0.7, ['Time Series Anomaly Detection', 'Streaming Anomaly Detection']],
        ]),
        T('lake', '数据湖与数据治理', 0.3, [
          ['lk_disc', '数据发现', 0.9, 1, ['Table Discovery', 'Data Discovery']],
          ['lk_ml', '面向 AI 的数据管理', 1.3, 1.2, ['Data Management for Machine Learning', 'Training Data Curation']],
          ['lk_clean', '数据清洗', 0.9, 0.9, ['Data Cleaning', 'Entity Resolution']],
          ['lk_format', '湖仓格式', 0.9, 0.9, ['Lakehouse Formats', 'Columnar Storage']],
        ]),
        T('llmdb', '大模型与数据', 0.8, [
          ['lb_sql', 'Text-to-SQL', 1.8, 1, ['Text-to-SQL', 'Natural Language Interfaces to Databases']],
          ['lb_agent', '数据智能体', 1.7, 1, ['Data Agents', 'Data Wrangling with LLMs']],
          ['lb_table', '表格理解', 1.4, 1, ['Table Question Answering', 'Table Understanding']],
          ['lb_sem', '语义查询处理', 1.3, 1, ['Semantic Operators', 'LLM-Powered Query Processing']],
        ]),
      ],
      methods: ['Learned Cardinality Estimation', 'Vector Indexing', 'Graph Neural Networks', 'Contrastive Learning', 'Approximate Query Processing', 'LLM-Based Agents', 'Columnar Storage', 'Incremental View Maintenance', 'Federated Analytics', 'Hypergraph Learning', 'Time Series Transformers', 'Data Augmentation'],
    },
    arch: {
      id: 'arch', name: '体系结构', short: 'Arch', compute: 0.3, citeMult: 0.7, grantMult: 1.1,
      need: { idea: 35, exp: 120, write: 35 },
      desc: '芯片是国之重器。仿真要跑很久，流片要花很多钱，产业界非常需要。',
      topics: [
        T('accel', 'AI 加速器', 0.6, [
          ['xl_llm', '大模型推理加速器', 1.9, 1, ['LLM Inference Accelerators', 'Transformer Accelerators']],
          ['xl_quant', '低比特计算', 1.4, 1, ['Low-Precision Arithmetic', 'Quantization-Aware Hardware']],
          ['xl_df', '数据流架构', 1.1, 0.9, ['Dataflow Architectures', 'Systolic Arrays']],
          ['xl_dse', '软硬件协同设计', 1, 1.1, ['Design Space Exploration', 'Hardware-Software Co-Design']],
        ]),
        T('pim', '存内计算', 0.3, [
          ['pi_dram', 'DRAM 存内计算', 1.2, 1, ['In-DRAM Computing', 'Processing-in-Memory']],
          ['pi_llm', '存内计算跑大模型', 1.4, 1.1, ['PIM for LLM Inference', 'Memory-Centric Accelerators']],
          ['pi_nvm', '新型存储器件', 1.1, 1, ['ReRAM Crossbars', 'Analog In-Memory Computing']],
          ['pi_ndp', '近数据处理', 1, 0.9, ['Near-Data Processing', 'Computational Storage']],
        ]),
        T('chiplet', 'Chiplet 与先进封装', 0.3, [
          ['cl_het', '异构集成', 1.3, 1, ['Heterogeneous Integration', 'Chiplet Architectures']],
          ['cl_int', '片间互连', 1.1, 1, ['Die-to-Die Interconnects', 'Network-on-Package']],
          ['cl_photon', '硅光互连', 1, 1, ['Silicon Photonics', 'Optical Interconnects']],
          ['cl_3d', '3D 堆叠', 1, 1, ['3D Stacking', 'Hybrid Bonding']],
        ]),
        T('riscv', 'RISC-V 与处理器', 0.2, [
          ['rv_agile', '敏捷硬件开发', 1.1, 1.0, ['Agile Hardware Design', 'Hardware Description Languages']],
          ['rv_vec', '向量扩展', 1.0, 1.0, ['Vector Extensions', 'RISC-V Vector Processors']],
          ['rv_verify', '处理器验证', 0.9, 1.0, ['Processor Verification', 'Hardware Fuzzing']],
          ['rv_ooo', '乱序微结构', 0.9, 1.0, ['Out-of-Order Microarchitecture', 'Branch Prediction']],
        ]),
        T('qarch', '量子体系结构', 0.2, [
          ['qa_qec', '纠错架构', 1.3, 1.0, ['Quantum Error Correction Architectures', 'Surface Code Decoders']],
          ['qa_map', '量子比特映射', 1.0, 1.0, ['Qubit Mapping', 'Quantum Circuit Compilation']],
          ['qa_ctrl', '量子控制系统', 0.9, 1.0, ['Quantum Control Systems', 'Cryogenic Control Electronics']],
          ['qa_dist', '分布式量子计算', 0.9, 1.0, ['Distributed Quantum Computing', 'Modular Quantum Architectures']],
        ]),
        T('mem', '内存系统', 0.3, [
          ['me_cxl', 'CXL 内存扩展', 1.1, 1.0, ['CXL Memory Expansion', 'Memory Pooling']],
          ['me_cache', '缓存层次', 0.8, 1.0, ['Cache Hierarchies', 'Cache Replacement Policies']],
          ['me_comp', '内存压缩', 0.8, 1.0, ['Memory Compression', 'Data Compression Hardware']],
          ['me_rel', '内存可靠性', 0.8, 1.0, ['Memory Reliability', 'Row Hammer Mitigation']],
        ]),
        T('sparse', '稀疏与图计算', 0.4, [
          ['sx_mm', '稀疏矩阵', 1.1, 1, ['Sparse Matrix Multiplication', 'Sparse Tensor Acceleration']],
          ['sx_attn', '稀疏注意力硬件', 1.3, 1.1, ['Sparse Attention Hardware', 'Dynamic Sparsity']],
          ['sx_gnn', '图计算加速', 1, 1, ['GNN Acceleration', 'Graph Processing Hardware']],
          ['sx_rec', '推荐模型加速', 0.9, 0.9, ['Recommendation Model Acceleration', 'Embedding Lookup Acceleration']],
        ]),
        T('eda', '芯片设计自动化', 0.4, [
          ['eda_place', '布局布线', 1, 1, ['Placement and Routing', 'Macro Placement']],
          ['eda_llm', '大模型生成 RTL', 1.5, 1.2, ['LLM-Aided Hardware Design', 'RTL Code Generation']],
          ['eda_verify', '形式验证', 0.9, 0.9, ['Hardware Formal Verification', 'Equivalence Checking']],
          ['eda_timing', '时序与功耗分析', 0.8, 0.9, ['Timing Analysis', 'Power Estimation']],
        ]),
      ],
      methods: ['Systolic Arrays', 'Near-Memory Processing', 'Chiplet Integration', 'Sparse Dataflow', 'Approximate Computing', 'Photonic Interconnects', 'Cache Partitioning', 'Hardware Prefetching', 'Speculative Execution', 'Quantization-Aware Hardware', 'Silicon Photonics', '3D Stacking'],
    },
    se: {
      id: 'se', name: '软件工程', short: 'SE', compute: 0.4, citeMult: 0.85, grantMult: 1.0,
      need: { idea: 32, exp: 100, write: 38 },
      desc: '代码大模型让这个领域焕发新生。ICSE 两轮投稿，评审以严格著称。',
      topics: [
        T('codellm', '代码大模型', 0.9, [
          ['cg_gen', '代码生成', 2.1, 1, ['Code Generation', 'Repository-Level Code Completion']],
          ['cg_agent', '软件工程智能体', 2.2, 1.2, ['Software Engineering Agents', 'Issue Resolution with LLMs']],
          ['cg_eval', '代码模型评测', 1.3, 0.9, ['Code LLM Evaluation', 'Code Benchmark Contamination']],
          ['cg_trans', '代码翻译', 1.2, 1, ['Code Translation', 'C-to-Rust Migration']],
          ['cg_review', '代码审查', 1.2, 0.9, ['Code Review Automation', 'Commit Message Generation']],
        ]),
        T('apr', '程序修复', 0.5, [
          ['rp_llm', '大模型修复', 1.4, 1, ['LLM-Based Program Repair', 'Conversational Program Repair']],
          ['rp_vuln', '漏洞修复', 1.2, 1.1, ['Vulnerability Repair', 'Patch Correctness Assessment']],
          ['rp_fl', '缺陷定位', 1, 1, ['Fault Localization', 'Bug Localization']],
          ['rp_bug', '缺陷报告', 0.9, 0.9, ['Bug Report Analysis', 'Bug Reproduction']],
        ]),
        T('testing', '软件测试', 0.3, [
          ['tt_unit', '单元测试生成', 1.2, 1, ['Unit Test Generation', 'Test Oracle Generation']],
          ['tt_dl', '深度学习系统测试', 1.1, 1.2, ['Testing Deep Learning Systems', 'Deep Learning Framework Testing']],
          ['tt_auto', '自动驾驶测试', 1, 1.2, ['Autonomous Driving System Testing', 'Critical Scenario Generation']],
          ['tt_flaky', '不稳定测试', 0.9, 0.8, ['Flaky Test Detection', 'Regression Testing']],
          ['tt_compiler', '编译器测试', 0.9, 0.8, ['Compiler Testing', 'Differential Testing']],
        ]),
        T('analysis', '程序分析', 0.2, [
          ['an_static', '静态分析', 0.9, 1, ['Static Analysis', 'Pointer Analysis']],
          ['an_llm', '大模型辅助分析', 1.4, 1.3, ['LLM-Assisted Static Analysis', 'Neural Program Analysis']],
          ['an_taint', '污点分析', 0.9, 0.9, ['Taint Analysis', 'Information Flow Tracking']],
          ['an_conc', '并发缺陷', 0.8, 0.8, ['Concurrency Bug Detection', 'Data Race Detection']],
        ]),
        T('oss', '开源与开发者', 0.2, [
          ['oe_dev', '开发者效率', 1, 1, ['Developer Productivity', 'Developer Onboarding']],
          ['oe_ai', 'AI 与开发者', 1.4, 1.2, ['AI Pair Programming', 'Developer Trust in AI Tools']],
          ['oe_eco', '开源可持续性', 0.9, 0.9, ['Open Source Sustainability', 'Open Source Ecosystems']],
          ['oe_mine', '仓库挖掘', 0.9, 0.9, ['Mining Software Repositories', 'Software Evolution']],
        ]),
        T('sesmart', '程序语言与验证', 0.2, [
          ['pl_sc', '智能合约分析', 0.8, 1, ['Smart Contract Analysis', 'Smart Contract Verification', 'Gas Optimization']],
          ['pl_verify', '程序验证', 1, 0.9, ['Program Verification', 'Verified Compilers']],
          ['pl_synth', '程序综合', 1.1, 1.3, ['Program Synthesis', 'Neurosymbolic Programming']],
          ['pl_rust', 'Rust 与内存安全', 1.1, 0.9, ['Rust Verification', 'Memory Safety Analysis']],
          ['pl_type', '类型系统', 0.8, 0.9, ['Type Systems', 'Type Inference']],
        ]),
      ],
      methods: ['Large Language Models', 'Mutation Testing', 'Symbolic Execution', 'Program Synthesis', 'Fuzzing', 'Static Analysis', 'Neural Code Search', 'Graph Neural Networks', 'Agentic Workflows', 'Differential Testing', 'Search-Based Testing', 'Abstract Interpretation'],
    },
    graphics: {
      id: 'graphics', name: '图形学', short: 'Graphics', compute: 0.6, citeMult: 0.75, grantMult: 0.95,
      need: { idea: 38, exp: 110, write: 40 },
      desc: 'SIGGRAPH 的 Fast Forward 是一年中最快乐的时光。好看的 Demo 就是一切。',
      topics: [
        T('nrender', '渲染', 1.0, [
          ['nr_neural', '神经渲染', 1.8, 1, ['Neural Rendering', 'Neural Radiance Caching']],
          ['nr_inv', '逆渲染', 1.4, 1.1, ['Inverse Rendering', 'Relighting', 'Material Estimation']],
          ['nr_rt', '实时渲染', 1.1, 0.9, ['Real-Time Rendering', 'Real-Time Ray Tracing']],
          ['nr_mc', '蒙特卡洛渲染', 0.9, 1, ['Monte Carlo Path Tracing', 'Light Transport']],
        ]),
        T('sim', '物理仿真', 0.6, [
          ['si_fluid', '流体', 1, 1, ['Fluid Simulation', 'Smoke Simulation']],
          ['si_diff', '可微仿真', 1.2, 1.2, ['Differentiable Simulation', 'Physics-Based Learning']],
          ['si_cloth', '布料与软体', 0.9, 0.9, ['Cloth Simulation', 'Soft Body Simulation']],
          ['si_contact', '接触与刚体', 0.8, 0.9, ['Rigid Body Contact', 'Collision Handling']],
        ]),
        T('geo', '几何处理', 0.3, [
          ['ge_mesh', '网格生成', 0.9, 1, ['Mesh Generation', 'Remeshing']],
          ['ge_learn', '几何深度学习', 1, 1.3, ['Geometric Deep Learning', 'Shape Correspondence']],
          ['ge_surf', '曲面重建', 0.9, 0.9, ['Surface Reconstruction', 'Implicit Surfaces']],
          ['ge_cad', 'CAD 与制造', 0.9, 0.8, ['CAD Generation', 'Computational Fabrication']],
        ]),
        T('anim', '角色动画', 0.7, [
          ['am_motion', '动作合成', 1.3, 1, ['Motion Synthesis', 'Text-to-Motion Generation']],
          ['am_phys', '物理角色控制', 1.1, 1.2, ['Physics-Based Character Control', 'Character Animation']],
          ['am_face', '面部动画', 1, 1, ['Facial Animation', 'Talking Head Synthesis']],
          ['am_retarget', '动作重定向', 0.9, 0.8, ['Motion Retargeting', 'Motion Matching']],
        ]),
        T('gen3d', '三维生成', 1.3, [
          ['g3_t23', '文生 3D', 1.9, 1, ['Text-to-3D', 'Score Distillation']],
          ['g3_asset', '三维资产生成', 1.8, 1.1, ['3D Asset Generation', 'Large Reconstruction Models']],
          ['g3_scene', '场景生成', 1.6, 1.1, ['3D Scene Generation', 'Indoor Scene Synthesis']],
          ['g3_tex', '纹理与材质生成', 1.2, 0.8, ['Texture Generation', 'PBR Material Generation']],
        ]),
        T('visu', '科学可视化', 0.3, [
          ['vz_vol', '体渲染', 0.8, 1, ['Volume Rendering', 'Scientific Visualization']],
          ['vz_flow', '流场可视化', 0.8, 1, ['Flow Visualization', 'Vector Field Visualization']],
          ['vz_unc', '不确定性可视化', 0.7, 0.9, ['Uncertainty Visualization', 'Ensemble Visualization']],
          ['vz_insitu', '原位可视化', 0.7, 1.1, ['In Situ Visualization', 'Large-Scale Data Visualization']],
        ]),
      ],
      methods: ['Neural Radiance Fields', 'Gaussian Splatting', 'Differentiable Rendering', 'the Material Point Method', 'Monte Carlo Path Tracing', 'Diffusion Models', 'Neural Implicit Surfaces', 'Position-Based Dynamics', 'Motion Matching', 'Spectral Geometry', 'Reinforcement Learning', 'Subdivision Surfaces'],
    },
    net: {
      id: 'net', name: '计算机网络', short: 'Networking', compute: 0.3, citeMult: 0.8, grantMult: 1.05,
      need: { idea: 32, exp: 110, write: 36 },
      desc: '从数据中心到低轨卫星，网络无处不在。SIGCOMM 一年一度，MobiCom 的 Demo 必须真能跑。',
      topics: [
        T('dcn', '数据中心网络', 0.4, [
          ['dc_cc', '拥塞控制', 1.1, 1, ['Congestion Control', 'Datacenter Transport']],
          ['dc_ai', 'AI 训练网络', 1.8, 1.3, ['Networks for LLM Training', 'Collective Communication Networks']],
          ['dc_rdma', 'RDMA 网络', 1.1, 0.9, ['RDMA Networks', 'Lossless Ethernet']],
          ['dc_p4', '可编程交换机', 1, 0.8, ['Programmable Switches', 'In-Network Computing']],
        ]),
        T('wireless', '无线与移动网络', 0.2, [
          ['wl_leo', '低轨卫星网络', 1.5, 1.0, ['LEO Satellite Networks', 'Satellite Internet']],
          ['wl_cell', '5G/6G 蜂窝网络', 1.1, 1.0, ['5G Networks', 'Open RAN']],
          ['wl_mmwave', '毫米波通信', 0.9, 1.0, ['mmWave Networking', 'Beam Management']],
          ['wl_wifi', '新一代 Wi-Fi', 0.9, 1.0, ['Next-Generation Wi-Fi', 'Spectrum Sharing']],
        ]),
        T('sensing', '无线感知与物联网', 0.2, [
          ['sn_wifi', 'Wi-Fi 感知', 1.1, 1, ['Wi-Fi Sensing', 'Device-Free Sensing']],
          ['sn_tiny', '端侧智能', 1.2, 1.3, ['TinyML', 'On-Device Learning for IoT']],
          ['sn_acou', '声学与雷达感知', 1, 0.9, ['Acoustic Sensing', 'mmWave Radar Sensing']],
          ['sn_back', '反向散射', 0.9, 0.8, ['Backscatter Communication', 'Battery-Free IoT']],
        ]),
        T('video', '视频传输', 0.4, [
          ['vs_rtc', '实时音视频', 1.1, 1, ['Real-Time Video Communication', 'Low-Latency Streaming']],
          ['vs_neural', '神经编解码', 1.3, 1.3, ['Neural Video Codecs', 'Semantic Communication']],
          ['vs_xr', '沉浸式视频', 1.2, 1, ['Volumetric Video Streaming', '360-Degree Video Streaming']],
          ['vs_abr', '自适应码率', 0.9, 0.7, ['Adaptive Bitrate Streaming', 'Video QoE Optimization']],
        ]),
        T('meas', '互联网测量与路由', 0.2, [
          ['ms_measure', '互联网测量', 1.0, 1.0, ['Internet Measurement', 'Network Performance Characterization']],
          ['ms_bgp', '路由安全', 0.9, 1.0, ['BGP Security', 'Interdomain Routing']],
          ['ms_cdn', '内容分发', 0.9, 1.0, ['Content Delivery Networks', 'Edge Caching']],
          ['ms_censor', '审查与匿名', 0.9, 1.0, ['Internet Censorship', 'Anonymity Networks']],
        ]),
        T('sdn', '网络软件化', 0.3, [
          ['nv_nic', '智能网卡', 1.1, 1, ['SmartNIC Offloading', 'Host Networking Stacks']],
          ['nv_llm', '网络大模型', 1.5, 1.3, ['LLMs for Networking', 'Learned Network Control']],
          ['nv_verify', '网络验证', 1, 0.8, ['Network Verification', 'Network Configuration Synthesis']],
          ['nv_nfv', '网络功能虚拟化', 0.9, 0.9, ['Network Function Virtualization', 'Service Function Chaining']],
        ]),
      ],
      methods: ['Programmable Data Planes', 'Reinforcement Learning', 'In-Network Computing', 'Kernel Bypass', 'Channel State Information', 'Software-Defined Networking', 'Erasure Coding', 'eBPF', 'Formal Verification', 'Digital Twins', 'Deep Learning', 'Multipath Transport'],
      templates: ['{Acr}: {Adj} {Task} at Internet Scale', 'Rethinking {Task} for the AI Era', 'Understanding {Task} in the Wild: A Measurement Study', '{Acr}: Sub-Millisecond {Task} with {Method}', '{Acr}: {Task} over the Air', 'Taming {Task} with {Method}'],
    },
  };

  // ---------- 方向与子方向的索引 ----------
  // RS.SUBS[子方向 id] = { id, name, heat, c, en, topic, area, compute }
  RS.SUBS = {};
  Object.values(RS.AREAS).forEach(A => {
    A.topics.forEach(t => {
      t.area = A.id;
      t.heat = t.subs.reduce((s, x) => s + x.heat, 0) / t.subs.length;
      t.en = [].concat(...t.subs.map(x => x.en));
      t.subs.forEach(s => {
        if (RS.SUBS[s.id]) console.warn('子方向 id 重复', s.id);
        s.topic = t.id;
        s.area = A.id;
        s.compute = t.compute * s.c;
        RS.SUBS[s.id] = s;
      });
    });
    A.subs = [].concat(...A.topics.map(t => t.subs));
  });

  // ---------- 论文标题 ----------
  // 占位符：{Adj} {Adj2} {Method} {Task} {Acr} {Noun} {Verb} {Thing} {Num} {Barrier}
  RS.TITLE_PARTS = {
    templates: [
      '{Adj} {Method} for {Task}', '{Acr}: {Adj} {Task} via {Method}', 'Towards {Adj} {Task}', 'Rethinking {Task} with {Method}',
      '{Method} Is All You Need for {Task}', 'When {Method} Meets {Task}', 'Scaling {Method} for {Task}', 'On the {Noun} of {Method} in {Task}',
      'Revisiting {Method}: {Adj} {Task}', '{Acr}: {Method} for {Adj} {Task}', 'Beyond {Method}: {Adj} {Task}', 'A Unified Framework for {Task}',
      '{Acr}: Taming {Task} with {Method}', 'A Closer Look at {Method} for {Task}', 'Demystifying {Method} in {Task}',
      'Is {Method} Really Necessary for {Task}?', 'What Makes {Method} Work for {Task}?', 'Less Is More: {Adj} {Task} with {Method}',
      '{Adj} and {Adj2} {Task}', '{Acr}: Bridging {Method} and {Task}', 'From {Method} to {Task}', '{Task} at Scale: Lessons from {Acr}',
      'Mind the Gap: {Method} for {Task}', '{Acr}: Teaching Models to {Verb} in {Task}', 'Learning to {Verb}: {Adj} {Task} with {Method}',
      'The {Noun} of {Task}: An Empirical Study', 'Unlocking {Adj} {Task} with {Method}', '{Acr}: A Benchmark for {Task}',
      '{Acr}-{Num}: A Large-Scale Dataset for {Task}', 'Do We Really Need {Method} for {Task}?', 'Not All {Thing} Are Equal: {Adj} {Task}',
      'Fewer {Thing}, Better {Task}', 'Breaking the {Barrier} in {Task}', '{Adj} {Task} in the Wild', 'Provably {Adj} {Task}',
      '{Method} as a Lens on {Task}', '{Acr}: {Adj}, {Adj2} {Task} with {Method}', 'Self-Supervised {Task} via {Method}', 'Can {Method} Help {Task}?',
      '{Task} through the Lens of {Method}', '{Acr}: Plug-and-Play {Method} for {Task}', 'On the {Noun} of {Task}', 'Training-Free {Task} with {Method}',
      'Towards Trustworthy {Task}', '{Method} Done Right for {Task}', '{Acr}: Rethinking {Thing} in {Task}',
    ],
    // 偶尔冒出来的“标题党”
    fun: [
      '{Method} Is Not All You Need', 'We Need to Talk About {Task}', 'No Free Lunch in {Task}', 'The Unreasonable Effectiveness of {Method} in {Task}',
      'Everything You Always Wanted to Know About {Task}', '{Task} Considered Harmful', 'Stop Using {Method} for {Task}', 'Yes, {Method} Can Do {Task}',
      'Attention Is Still All You Need for {Task}', 'Is {Task} Solved? Not Yet', 'One {Method} to Rule Them All', '{Task}: The Good, the Bad, and the Ugly',
    ],
    adj: [
      'Efficient', 'Scalable', 'Robust', 'Provable', 'Generalizable', 'Adaptive', 'Lightweight', 'Unified', 'Faithful', 'Fast', 'Private', 'Interpretable',
      'Practical', 'Zero-Shot', 'Data-Efficient', 'Fine-Grained', 'Holistic', 'Hierarchical', 'Compositional', 'Training-Free', 'Self-Improving', 'Calibrated',
      'Long-Horizon', 'Multi-Scale', 'Energy-Efficient', 'Verifiable', 'Decentralized', 'Continual', 'Causal', 'Sparse', 'Equivariant', 'Memory-Efficient',
      'Streaming', 'Open-World', 'Certified', 'Elastic', 'Explainable', 'Resilient', 'Modular', 'Fair',
    ],
    noun: ['Limits', 'Power', 'Robustness', 'Expressivity', 'Pitfalls', 'Generalization', 'Benefits', 'Brittleness', 'Hidden Costs', 'Surprising Effectiveness', 'Role', 'Geometry', 'Dynamics', 'Fragility', 'Scaling Behavior', 'Trade-offs'],
    verb: ['Reason', 'Generalize', 'Compress', 'Plan', 'Forget', 'Adapt', 'Explain', 'Verify', 'Collaborate', 'Self-Correct', 'Search', 'Remember'],
    thing: ['Tokens', 'Layers', 'Samples', 'Experts', 'Features', 'Gradients', 'Queries', 'Edges', 'Pixels', 'Heads', 'Parameters', 'Demonstrations'],
    num: ['1M', '10K', '100K', '1B', '50K', '2M', '500K'],
    barrier: ['Memory Wall', 'Quadratic Barrier', 'Data Bottleneck', 'Latency Barrier', 'Scaling Ceiling', 'Annotation Bottleneck'],
    acr: [
      'FLASH', 'SPARK', 'LUMEN', 'ORCA', 'MAPLE', 'NOVA', 'TITAN', 'ECHO', 'PRISM', 'HALO', 'ATLAS', 'COMET', 'FALCON', 'PANDA', 'LOTUS', 'ZEBRA',
      'QUILL', 'RAVEN', 'SIGMA', 'TURBO', 'VORTEX', 'PIXIE', 'MOCHI', 'BOBA', 'DUMPLING', 'TOFU', 'BAOZI', 'WONTON', 'MANGO', 'KIWI', 'OTTER', 'BADGER',
      'LYNX', 'NEXUS', 'HELIX', 'ZEPHYR', 'AURORA', 'EMBER', 'GLACIER', 'TEMPO', 'MOSAIC', 'ORBIT', 'PULSAR', 'QUASAR', 'GLOW', 'BEACON', 'CIRRUS',
      'DELTA', 'FABLE', 'GECKO', 'HERON', 'IRIS', 'JADE', 'KOALA', 'LARK', 'MERLIN', 'NIMBUS', 'OPAL', 'PEBBLE', 'QUOKKA', 'RIPPLE', 'SAGE', 'TAPIR',
      'UMBRA', 'VELVET', 'WALRUS', 'YETI', 'ZENITH', 'MANTIS', 'CRANE', 'SPROUT', 'TEAPOT', 'NOODLE', 'MOONCAKE', 'HOTPOT', 'JIAOZI', 'MAHJONG', 'PANGOLIN',
    ],
    acrSuffix: ['++', '-2', 'v2', 'XL', '-Zero', '-R1', '-Lite', '-Pro'],
  };

  // 各领域自己的标题风格
  const AREA_TEMPLATES = {
    ml: ['Provably {Adj} {Task} via {Method}', 'Understanding {Method} through the Lens of {Task}', 'Scaling Laws for {Task}', 'A Theoretical Analysis of {Method} for {Task}',
      '{Acr}: {Adj} {Task} with {Method}', 'Sample-Efficient {Task} via {Method}', 'In Defense of {Method} for {Task}', 'The Implicit Bias of {Method} in {Task}',
      'How Does {Method} Help {Task}?', 'Stabilizing {Task} with {Method}'],
    cv: ['{Acr}: {Adj} {Task} from a Single Image', 'Learning {Task} from Unlabeled Videos', '{Task} in the Wild with {Method}', '{Acr}: Seeing {Task} through {Method}',
      'Open-World {Task} via {Method}', '{Acr}: Real-Time {Task} on Mobile Devices', 'Zero-Shot {Task} with {Method}', 'Segment, Track, and Reconstruct: {Adj} {Task}',
      'Pixel-Perfect {Task} with {Method}', '{Task} from Sparse Views via {Method}'],
    nlp: ['Do Large Language Models Understand {Task}?', '{Acr}: A Benchmark for Evaluating {Task}', 'Teaching Language Models to {Verb} with {Method}',
      'The Curious Case of {Task} in Language Models', '{Method} Improves {Task} in Language Models', 'Large Language Models Are {Adj} {Task} Learners',
      'Lost in {Task}: How Language Models Fail', '{Acr}: {Adj} {Task} via {Method}', 'Language Models Can {Verb} through {Method}', 'Revisiting {Task} in the Era of Large Language Models'],
    sys: ['{Acr}: {Adj} {Task} with {Method}', '{Acr}: Fast and Correct {Task}', 'Taming Tail Latency in {Task}', 'Understanding and Improving {Task} in Production',
      '{Acr}: Rethinking the {Task} Stack', 'Fine-Grained {Task} with {Method}', '{Acr}: {Task} at Datacenter Scale', 'A Large-Scale Characterization of {Task} in the Cloud',
      '{Acr}: Making {Task} {Adj} with {Method}', 'Zero-Copy {Task} via {Method}'],
    sec: ['SoK: {Task}', '{Acr}: Practical {Task} at Scale', 'Revisiting {Task}: Attacks and Defenses', 'Hidden in Plain Sight: {Task} via {Method}', 'Measuring {Task} in the Wild',
      '{Acr}: Towards Provably Secure {Task}', '{Acr}: Hunting Bugs in {Task} with {Method}', 'You Can Run but You Cannot Hide: {Task}', '{Acr}: Automated {Task} via {Method}',
      'Breaking and Fixing {Task}'],
    theory: ['Optimal {Task} in Near-Linear Time', 'Lower Bounds for {Task}', 'A Simple Proof for {Task} via {Method}', '{Task} Beyond the Worst Case', 'Derandomizing {Task}',
      'Tight Analysis of {Task}'],
    hci: ['{Acr}: Co-Designing {Task} with Communities', '"I Felt Heard": {Task} in Practice', 'Towards Inclusive {Task}', '{Acr}: Augmenting {Task} with {Method}',
      'A Longitudinal Study of {Task}', 'Speculative Design for {Task}'],
    robo: ['{Acr}: Learning {Task} from Human Videos', 'Generalist {Task} with {Method}', '{Task} in the Real World via {Method}', 'One Policy to Rule Them All: {Task}',
      'Learning {Task} from a Handful of Demonstrations', '{Acr}: Robust {Task} on Real Hardware', 'Sim-to-Real {Task} with {Method}', '{Acr}: {Adj} {Task} for Household Robots',
      'Scaling Up {Task} with {Method}'],
    db: ['{Acr}: Learned {Task}', 'Towards Instance-Optimal {Task}', '{Task} for the LLM Era', 'An Experimental Evaluation of {Task}', 'Are We There Yet? Revisiting {Task}',
      '{Acr}: {Adj} {Task} over Massive Data', '{Method} Meets {Task}: A Systematic Study', '{Acr}: Interactive {Task} at Scale', 'Efficient and Accurate {Task} via {Method}'],
    arch: ['{Acr}: An Accelerator for {Task}', '{Acr}: Energy-Efficient {Task} with {Method}', 'Rethinking {Task} for the Post-Moore Era', 'Characterizing {Task} on Modern Hardware',
      '{Acr}: Co-Designing {Task} and {Method}', 'Breaking the Memory Wall in {Task}', '{Acr}: A Scalable Architecture for {Task}', 'Bit-Level {Task} with {Method}'],
    se: ['An Empirical Study of {Task}', 'How Far Are We from {Adj} {Task}?', '{Acr}: Automated {Task} via {Method}', 'Large Language Models for {Task}: Promise and Pitfalls',
      'Revisiting {Task} in the Era of {Method}', '{Acr}: {Adj} {Task} for Real-World Projects', 'Mining Software Repositories for {Task}', 'Towards Reliable {Task} with {Method}'],
    graphics: ['{Acr}: Real-Time {Task} with {Method}', 'Differentiable {Task}', '{Task} from Sparse Inputs via {Method}', 'Learning {Task} from a Single Video',
      'Physically-Based {Task} with {Method}', '{Acr}: Interactive {Task} for Artists', 'Neural {Task} with {Method}', '{Acr}: Controllable {Task}'],
  };
  Object.keys(RS.AREAS).forEach(id => {
    const A = RS.AREAS[id];
    if (AREA_TEMPLATES[id]) A.templates = (A.templates || []).concat(AREA_TEMPLATES[id]);
  });
})();
