/* 会议与期刊：等级参考 CCF 推荐目录（数据来自 ccfddl），截稿日期取最近一届（月日，每月按 30 天计，近似值）
   投稿范围 scope：领域 id（整个领域都能投，第一个是“本领域”）、#方向、@子方向，用空格分开 */
(function () {
  'use strict';
  const RS = window.RS;
  const VENUES = (RS.VENUES = {});

  // tier：游戏里的等级（A/B/C/W）。有 CCF 等级的按 CCF，没有的按业内认可度给
  // o：rebuttal 有作者回复；parity 'odd'/'even' 只在奇/偶数年举办；bar 录用门槛加减；cm 引用倍率（同一等级里更有影响力的会议）；home 本领域；full 全称
  function add(id, name, type, tier, ccf, dl, review, scope, o) {
    o = o || {};
    const v = { id, name, type, tier, ccf: ccf || null, dl, review, parity: o.parity || null, rebuttal: !!o.rebuttal, bar: o.bar || 0, cm: o.cm || 1, full: o.full || '', areas: [], topics: [], subs: [] };
    scope.split(/\s+/).filter(Boolean).forEach(t => {
      if (t[0] === '#') v.topics.push(t.slice(1));
      else if (t[0] === '@') v.subs.push(t.slice(1));
      else v.areas.push(t);
    });
    v.home = o.home || v.areas[0] || null;
    VENUES[id] = v;
  }
  const C = (id, name, tier, ccf, dl, review, scope, o) => add(id, name, 'conf', tier, ccf, dl, review, scope, o);
  const J = (id, name, tier, ccf, review, scope, o) => add(id, name, 'jour', tier, ccf, null, review, scope, o);
  const W = (id, name, dl, review, scope, o) => add(id, name, 'ws', 'W', null, dl, review, scope, o);

  VENUES.arxiv = { id: 'arxiv', name: 'arXiv', type: 'pre', tier: 'P', ccf: null, dl: null, review: 0, parity: null, rebuttal: false, bar: 0, cm: 1, full: '', areas: [], topics: [], subs: [], home: null };
  // 跨学科合作发的论文（不在任何投稿列表里）
  VENUES.cross = { id: 'cross', name: '交叉学科期刊', type: 'jour', tier: 'B', ccf: null, dl: null, review: 0, parity: null, rebuttal: false, bar: 0, cm: 1, full: '', areas: [], topics: [], subs: [], home: null };

  // —— 人工智能 / 机器学习 ——
  C('neurips', 'NeurIPS', 'A', 'A', [[5, 7]], 135, 'ml cv nlp #embodied #il #manip #legged #humanoid #lt #online #agt #rec #ts #gmine #privacy #llmsec #gen3d #nrender #codellm #dtrain #serving', { rebuttal: true, cm: 1.3, full: 'Conference on Neural Information Processing Systems' });
  C('icml', 'ICML', 'A', 'A', [[1, 29]], 100, 'ml cv nlp #embodied #il #manip #legged #humanoid #lt #online #agt #rec #ts #gmine #privacy #llmsec #codellm #dtrain #serving', { rebuttal: true, cm: 1.3, full: 'International Conference on Machine Learning' });
  C('iclr', 'ICLR', 'A', 'A', [[9, 25]], 115, 'ml cv nlp #embodied #il #manip #legged #humanoid #lt #online #rec #ts #gmine #privacy #llmsec #gen3d #nrender #codellm #dtrain #serving', { rebuttal: true, cm: 1.3, full: 'International Conference on Learning Representations' });
  C('aaai', 'AAAI', 'A', 'A', [[7, 28]], 100, 'ml cv nlp robo #agt #lt #online #rec #ts #gmine #llmdb #haic #privacy #llmsec #codellm', { rebuttal: true, full: 'AAAI Conference on Artificial Intelligence' });
  C('ijcai', 'IJCAI', 'B', 'B', [[1, 19]], 95, 'ml cv nlp robo #agt #lt #online #rec #ts #gmine #llmdb #haic #privacy #llmsec #codellm', { rebuttal: true, bar: 3, cm: 1.5, full: 'International Joint Conference on Artificial Intelligence' });
  C('uai', 'UAI', 'B', 'B', [[2, 25]], 90, 'ml #lt', { full: 'Conference on Uncertainty in Artificial Intelligence' });
  C('colt', 'COLT', 'B', 'B', [[2, 4]], 85, '#lt #online #opt @rl_explore @diff_theory @gnn_theory', { bar: 3, cm: 1.4, home: 'theory', full: 'Annual Conference on Learning Theory' });
  C('ecai', 'ECAI', 'B', 'B', [[4, 14]], 80, 'ml nlp robo #agt', { full: 'European Conference on Artificial Intelligence' });
  C('aamas', 'AAMAS', 'B', 'B', [[10, 8]], 90, '@rl_marl #agt @ag_multi @ag_sim @pn_multi', { home: 'ml', full: 'International Conference on Autonomous Agents and Multiagent Systems' });
  C('aistats', 'AISTATS', 'C', 'C', [[10, 6]], 100, 'ml #lt', { full: 'International Conference on Artificial Intelligence and Statistics' });
  C('alt', 'ALT', 'C', 'C', [[10, 12]], 70, '#lt #online', { home: 'theory', full: 'International Conference on Algorithmic Learning Theory' });
  C('acml', 'ACML', 'C', 'C', [[6, 20]], 70, 'ml', { full: 'Asian Conference on Machine Learning' });
  C('log', 'LoG', 'C', null, [[8, 7]], 80, '#gnn #gmine', { home: 'ml', full: 'Learning on Graphs Conference' });
  C('satml', 'SaTML', 'C', null, [[9, 29]], 80, '#llmsec #privacy #align', { home: 'sec', full: 'IEEE Conference on Secure and Trustworthy Machine Learning' });
  J('jmlr', 'JMLR', 'A', 'A', 240, 'ml #lt', { full: 'Journal of Machine Learning Research' });
  J('aij', 'AIJ', 'A', 'A', 260, 'ml nlp robo #agt', { full: 'Artificial Intelligence' });
  J('tmlr', 'TMLR', 'B', null, 120, 'ml cv nlp', { full: 'Transactions on Machine Learning Research' });
  J('tnnls', 'TNNLS', 'B', 'B', 200, 'ml cv', { full: 'IEEE Transactions on Neural Networks and Learning Systems' });
  W('ml_ws', 'NeurIPS Workshop', [[9, 5]], 30, 'ml cv nlp #embodied #il #llmsec #codellm');

  // —— 计算机视觉 ——
  C('cvpr', 'CVPR', 'A', 'A', [[11, 13]], 105, 'cv #gen3d #nrender #anim #geo #embodied #manip #slam', { rebuttal: true, cm: 1.3, full: 'IEEE/CVF Conference on Computer Vision and Pattern Recognition' });
  C('iccv', 'ICCV', 'A', 'A', [[3, 8]], 125, 'cv #gen3d #nrender #anim #geo #embodied #manip #slam', { rebuttal: true, parity: 'odd', cm: 1.3, full: 'IEEE International Conference on Computer Vision' });
  C('eccv', 'ECCV', 'B', 'B', [[3, 5]], 125, 'cv #gen3d #nrender #anim #geo #embodied #manip #slam', { rebuttal: true, parity: 'even', bar: 3, cm: 1.6, full: 'European Conference on Computer Vision' });
  C('acmmm', 'ACM MM', 'A', 'A', [[4, 1]], 100, 'cv #video #anim #gen3d #nrender #rec @mt_speech @dl_speech', { rebuttal: true, full: 'ACM International Conference on Multimedia' });
  C('miccai', 'MICCAI', 'B', 'B', [[2, 26]], 100, '#med', { rebuttal: true, home: 'cv', full: 'International Conference on Medical Image Computing and Computer Assisted' });
  C('icme', 'ICME', 'B', 'B', [[12, 30]], 90, 'cv #video', { full: 'The IEEE International Conference on Multimedia & Expo' });
  C('icmr', 'ICMR', 'B', 'B', [[1, 30]], 80, '#vlm #rec @rag_retr @vd_ann', { home: 'cv', full: 'ACM SIGMM International Conference on Multimedia Retrieval' });
  C('accv', 'ACCV', 'C', 'C', [[7, 5]], 80, 'cv', { parity: 'even', full: 'Asian Conference on Computer Vision' });
  C('bmvc', 'BMVC', 'C', 'C', [[5, 29]], 90, 'cv', { full: 'British Machine Vision Conference' });
  C('wacv', 'WACV', 'C', null, [[6, 26], [8, 28]], 75, 'cv', { full: 'IEEE/CVF Winter Conference on Applications of Computer Vision' });
  C('3dv', '3DV', 'C', 'C', [[8, 28]], 80, '#3d #gen3d #nrender #geo @sm_neural', { home: 'cv', full: 'International Conference on 3D Vision' });
  C('icip', 'ICIP', 'C', 'C', [[2, 4]], 100, 'cv @vs_neural', { full: 'The IEEE International Conference on Image Processing' });
  J('tpami', 'TPAMI', 'A', 'A', 270, 'cv ml', { full: 'IEEE Transactions on Pattern Analysis and Machine Intelligence' });
  J('ijcv', 'IJCV', 'A', 'A', 240, 'cv', { full: 'International Journal of Computer Vision' });
  J('tip', 'TIP', 'A', 'A', 200, 'cv @vs_neural', { full: 'IEEE Transactions on Image Processing' });
  W('cv_ws', 'CVPR Workshop', [[3, 10]], 30, 'cv #embodied #gen3d');

  // —— 自然语言处理 ——
  C('acl', 'ACL', 'A', 'A', [[10, 6], [1, 5]], 95, 'nlp #llm #align #xai #codellm #llmdb @ls_jail @ls_inject @ls_wm @gm_kg', { rebuttal: true, full: 'Annual Meeting of the Association for Computational Linguistics' });
  C('emnlp', 'EMNLP', 'B', 'B', [[5, 25]], 95, 'nlp #llm #align #xai #codellm #llmdb @ls_jail @ls_inject @ls_wm @gm_kg', { rebuttal: true, bar: 3, cm: 1.6, full: 'The annual Conference on Empirical Methods in Natural Language Processing' });
  C('naacl', 'NAACL', 'B', 'B', [[10, 12]], 95, 'nlp #llm #align #xai #codellm #llmdb', { rebuttal: true, bar: 2, cm: 1.3, full: 'The Annual Conference of the North American Chapter of the Association' });
  C('coling', 'COLING', 'B', 'B', [[9, 16]], 100, 'nlp', { full: 'International Conference on Computational Linguistics' });
  C('colm', 'COLM', 'B', null, [[3, 31]], 75, 'nlp #llm #align #xai', { rebuttal: true, full: 'Conference on Language Modeling' });
  C('eacl', 'EACL', 'C', null, [[10, 11]], 90, 'nlp', { full: 'The Annual Conference of the European Chapter of the Association for' });
  C('conll', 'CoNLL', 'C', 'C', [[2, 19]], 80, 'nlp', { full: 'Conference on Computational Natural Language Learning' });
  C('nlpcc', 'NLPCC', 'C', 'C', [[6, 20]], 60, 'nlp', { full: 'CCF International Conference on Natural Language Processing and Chinese' });
  C('interspeech', 'Interspeech', 'B', 'B', [[2, 25]], 100, '@mt_speech @dl_speech @sn_acou', { home: 'nlp', full: 'Conference of the International Speech Communication Association' });
  C('icassp', 'ICASSP', 'B', 'B', [[9, 23]], 100, '@mt_speech @dl_speech @sn_acou @im_restore @vs_neural', { home: 'nlp', full: 'IEEE International Conference on Acoustics, Speech, and Signal Processing' });
  J('tacl', 'TACL', 'B', null, 150, 'nlp', { full: 'Transactions of the Association for Computational Linguistics' });
  W('nlp_ws', 'ACL Workshop', [[4, 20]], 30, 'nlp');

  // —— 计算机系统 ——
  C('osdi', 'OSDI', 'A', 'A', [[12, 8]], 105, 'sys @vd_sys @nv_nic @dc_rdma', { full: 'USENIX Symposium on Operating Systems Design and Implementation' });
  C('sosp', 'SOSP', 'A', 'A', [[4, 1]], 120, 'sys @vd_sys @nv_nic', { full: 'ACM Symposium on Operating Systems Principles' });
  C('atc', 'SIGOPS ATC', 'A', 'A', [[6, 11]], 95, 'sys @vd_sys @nv_nic', { full: 'ACM SIGOPS Annual Technical Conference' });
  C('nsdi', 'NSDI', 'A', 'A', [[4, 23], [9, 17]], 100, 'sys net', { full: 'USENIX Symposium on Networked Systems Design and Implementation' });
  C('eurosys', 'EuroSys', 'A', 'A', [[5, 14], [9, 24]], 100, 'sys', { full: 'European Conference on Computer Systems' });
  C('asplos', 'ASPLOS', 'A', 'A', [[3, 1], [6, 24], [10, 18]], 110, 'sys arch', { full: 'International Conference on Architectural Support for Programming Languages' });
  C('fast', 'FAST', 'A', 'A', [[3, 17], [9, 15]], 90, '#storage #cxl @st_ai @lk_format @pi_ndp', { home: 'sys', full: 'USENIX Conference on File and Storage Technologies' });
  C('hpdc', 'HPDC', 'A', 'A', [[2, 5]], 75, '#dtrain #sched #storage #serverless', { home: 'sys', full: 'ACM Symposium on High-Performance Parallel and Distributed Computing' });
  C('sc', 'SC', 'A', 'A', [[4, 8]], 110, '#dtrain #sched #storage #compiler @sci_weather @dc_ai', { home: 'sys', full: 'International Conference for High Performance Computing, Networking,' });
  C('ppopp', 'PPoPP', 'A', 'A', [[8, 3]], 90, '#compiler #dtrain @sx_mm', { home: 'sys', full: 'ACM SIGPLAN Symposium on Principles & Practice of Parallel Programming' });
  C('rtss', 'RTSS', 'A', 'A', [[5, 26]], 90, '#sched #os @sv_edge @tt_auto', { home: 'sys', full: 'The IEEE Real-Time Systems Symposium' });
  C('mlsys', 'MLSys', 'B', null, [[10, 30]], 100, '#serving #dtrain #compiler #sched #accel #fl @llm_eff @llm_arch', { home: 'sys', full: 'Conference on Machine Learning and Systems' });
  C('socc', 'SoCC', 'B', 'B', [[2, 13], [7, 14]], 80, '#serverless #sched #storage #cxl', { home: 'sys', full: 'ACM Symposium on Cloud Computing' });
  C('middleware', 'Middleware', 'B', 'B', [[6, 5], [12, 12]], 90, '#serverless #sched', { home: 'sys', full: 'International Middleware Conference' });
  C('icdcs', 'ICDCS', 'B', 'B', [[1, 21]], 80, '#serverless #sched #dtrain #dcn #sensing', { home: 'sys', full: 'IEEE International Conference on Distributed Computing Systems' });
  C('cluster', 'CLUSTER', 'B', 'B', [[5, 7]], 75, '#sched #dtrain #storage', { home: 'sys', full: 'IEEE International Conference on Cluster Computing' });
  C('ipdps', 'IPDPS', 'B', 'B', [[10, 8]], 90, '#dtrain #compiler #sched @sx_mm', { home: 'sys', full: 'IEEE International Parallel and Distributed Processing Symposium' });
  C('icpp', 'ICPP', 'B', 'B', [[5, 1]], 75, '#dtrain #sched #storage', { home: 'sys', full: 'International Conference on Parallel Processing' });
  C('hotos', 'HotOS', 'B', 'B', [[2, 1]], 60, 'sys', { parity: 'odd', full: 'USENIX Workshop on Hot Topics in Operating Systems' });
  C('hotstorage', 'HotStorage', 'C', 'C', [[6, 12]], 60, '#storage #cxl', { home: 'sys', full: 'ACM Workshop on Hot Topics in Storage and File Systems' });
  J('tocs', 'TOCS', 'A', 'A', 270, 'sys', { full: 'ACM Transactions on Computer Systems' });
  J('tos', 'TOS', 'A', 'A', 240, '#storage #cxl', { home: 'sys', full: 'ACM Transactions on Storage' });
  J('tpds', 'TPDS', 'A', 'A', 230, 'sys @dc_ai', { full: 'IEEE Transactions on Parallel and Distributed Systems' });
  W('sys_ws', 'Systems Workshop', [[5, 5]], 40, 'sys');

  // —— 网络与信息安全 ——
  C('sp', 'IEEE S&P', 'A', 'A', [[6, 5], [11, 13]], 100, 'sec @al_red @ms_bgp @ms_censor @me_rel @rv_verify @an_taint @rp_vuln @pl_sc @pl_rust', { full: 'IEEE Symposium on Security and Privacy' });
  C('ccs', 'CCS', 'A', 'A', [[1, 14], [4, 29]], 100, 'sec @al_red @ms_bgp @ms_censor @me_rel @rv_verify @an_taint @rp_vuln @pl_sc @pl_rust', { full: 'ACM Conference on Computer and Communications Security' });
  C('usenixsec', 'USENIX Security', 'A', 'A', [[2, 5], [8, 26]], 95, 'sec @al_red @ms_bgp @ms_censor @me_rel @rv_verify @an_taint @rp_vuln @pl_sc @pl_rust', { full: 'USENIX Security Symposium' });
  C('ndss', 'NDSS', 'A', 'A', [[5, 6], [8, 19]], 95, 'sec @al_red @ms_bgp @ms_censor @me_rel @rv_verify @an_taint @rp_vuln @pl_sc @pl_rust', { full: 'Network and Distributed System Security (NDSS) Symposium' });
  C('crypto', 'CRYPTO', 'A', 'A', [[2, 12]], 85, '#crypto @pv_mpc @pv_fhe', { home: 'sec', full: 'International Cryptology Conference' });
  C('eurocrypt', 'EUROCRYPT', 'A', 'A', [[9, 17]], 100, '#crypto @pv_mpc @pv_fhe', { home: 'sec', full: 'European Cryptology Conference' });
  C('asiacrypt', 'ASIACRYPT', 'B', 'B', [[5, 22]], 100, '#crypto @pv_mpc @pv_fhe', { home: 'sec', full: 'International Conference on the Theory and Application of Cryptology' });
  C('tcc', 'TCC', 'B', 'B', [[5, 19]], 90, '#crypto', { home: 'sec', full: 'Theory of Cryptography Conference' });
  C('ches', 'CHES', 'B', 'B', [[1, 15], [4, 15], [7, 15], [10, 15]], 80, '#side', { home: 'sec', full: 'International Conference on Cryptographic Hardware and Embedded Systems' });
  C('raid', 'RAID', 'B', 'B', [[4, 16]], 80, 'sec', { full: 'International Symposium on Recent Advances in Intrusion Detection' });
  C('acsac', 'ACSAC', 'B', 'B', [[5, 26]], 100, 'sec', { full: 'Annual Computer Security Applications Conference' });
  C('esorics', 'ESORICS', 'B', 'B', [[1, 9], [4, 21]], 80, 'sec', { full: 'European Symposium on Research in Computer Security' });
  C('dsn', 'DSN', 'B', 'B', [[12, 2]], 90, '#malware @sc_rel @rv_verify @me_rel @os_verify', { home: 'sec', full: 'International Conference on Dependable Systems and Networks' });
  C('eurosp', 'EuroS&P', 'C', 'C', [[12, 2]], 90, 'sec', { full: 'IEEE European Symposium on Security and Privacy' });
  C('asiaccs', 'AsiaCCS', 'C', 'C', [[8, 21], [12, 11]], 90, 'sec', { full: 'Asia Conference on Computer and Communications Security' });
  C('pets', 'PETS', 'C', 'C', [[2, 28], [5, 31], [8, 31], [11, 30]], 75, '#privacy @ms_censor', { home: 'sec', full: 'Privacy Enhancing Technologies Symposium' });
  C('soups', 'SOUPS', 'C', 'C', [[2, 19]], 80, '#privacy @so_mis @so_mod @hc_trust', { home: 'sec', full: 'Symposium On Usable Privacy and Security' });
  C('wisec', 'WiSec', 'C', 'C', [[3, 3], [11, 18]], 80, '#wireless @mw_android @sn_wifi', { home: 'sec', full: 'ACM Conference on Security and Privacy in Wireless and Mobile Networks' });
  J('tdsc', 'TDSC', 'A', 'A', 240, 'sec', { full: 'IEEE Transactions on Dependable and Secure Computing' });
  J('tifs', 'TIFS', 'A', 'A', 210, 'sec', { full: 'IEEE Transactions on Information Forensics and Security' });
  J('joc', 'JoC', 'A', 'A', 300, '#crypto @pv_mpc @pv_fhe', { home: 'sec', full: 'Journal of Cryptology' });
  W('sec_ws', 'Security Workshop', [[8, 1]], 35, 'sec');

  // —— 理论计算机 ——
  C('stoc', 'STOC', 'A', 'A', [[11, 4]], 85, 'theory', { full: 'ACM Symposium on the Theory of Computing' });
  C('focs', 'FOCS', 'A', 'A', [[4, 1]], 80, 'theory', { full: 'IEEE Symposium on Foundations of Computer Science' });
  C('soda', 'SODA', 'A', 'A', [[7, 9]], 85, 'theory', { full: 'ACM-SIAM Symposium on Discrete Algorithms' });
  C('lics', 'LICS', 'A', 'A', [[1, 22]], 75, '#logic #complex @pl_type @pl_verify', { home: 'theory', full: 'IEEE Symposium on Logic in Computer Science' });
  C('cav', 'CAV', 'A', 'A', [[1, 28]], 80, '#logic @pl_verify @os_verify @nv_verify @eda_verify @pl_rust', { home: 'theory', full: 'International Conference on Computer-Aided Verification' });
  C('icalp', 'ICALP', 'B', 'B', [[2, 6]], 65, 'theory', { full: 'EATCS International Colloquium on Automata, Languages, and Programming' });
  C('ccc', 'CCC', 'B', 'B', [[2, 6]], 75, '#complex #quantum', { home: 'theory', full: 'Computational Complexity Conference' });
  C('esa', 'ESA', 'B', 'B', [[4, 23]], 65, 'theory', { full: 'European Symposium on Algorithms' });
  C('socg', 'SoCG', 'B', 'B', [[12, 2]], 80, '#graph #approx', { home: 'theory', full: 'International Symposium on Computational Geometry' });
  C('concur', 'CONCUR', 'B', 'B', [[4, 27]], 70, '#logic', { home: 'theory', full: 'International Conference on Concurrency Theory' });
  C('sat', 'SAT', 'B', 'B', [[3, 10]], 70, '@lg_sat @lg_atp', { home: 'theory', full: 'International Conference on Theory and Applications of Satisfiability' });
  C('podc', 'PODC', 'B', 'B', [[2, 16]], 80, '@gr_dist @ch_bridge', { home: 'theory', full: 'ACM Symposium on Principles of Distributed Computing' });
  C('spaa', 'SPAA', 'B', 'B', [[1, 29]], 80, '@gr_dist @gr_dyn #sched', { home: 'theory', full: 'ACM Symposium on Parallelism in Algorithms and Architectures' });
  C('wine', 'WINE', 'B', 'B', [[7, 2]], 80, '#agt', { home: 'theory', full: 'Conference on Web and Internet Economics' });
  C('itcs', 'ITCS', 'B', null, [[9, 5]], 60, 'theory', { full: 'Innovations in Theoretical Computer Science' });
  C('isaac', 'ISAAC', 'C', 'C', [[6, 29]], 70, 'theory', { full: 'International Symposium on Algorithms and Computation' });
  J('jacm', 'JACM', 'A', 'A', 360, 'theory', { full: 'Journal of the ACM' });
  J('sicomp', 'SICOMP', 'A', 'A', 300, 'theory', { full: 'SIAM Journal on Computing' });
  J('tit', 'IEEE TIT', 'A', 'A', 300, '#complex #crypto #lt #quantum', { home: 'theory', full: 'IEEE Transactions on Information Theory' });
  W('th_ws', 'Theory Workshop', [[6, 1]], 30, 'theory');

  // —— 人机交互 ——
  C('chi', 'CHI', 'A', 'A', [[9, 11]], 105, 'hci #sensing', { rebuttal: true, full: 'ACM Conference on Human Factors in Computing Systems' });
  C('uist', 'UIST', 'A', 'A', [[3, 31]], 90, 'hci #sensing', { full: 'ACM Symposium on User Interface Software and Technology' });
  C('cscw', 'CSCW', 'A', 'A', [[5, 14]], 110, 'hci', { rebuttal: true, full: 'ACM Conference on Computer Supported Cooperative Work and Social Computing' });
  C('ubicomp', 'UbiComp / IMWUT', 'A', 'A', [[2, 1], [5, 1], [8, 1], [11, 1]], 100, 'hci #sensing', { full: 'ACM International Joint Conference on Pervasive and Ubiquitous Computing' });
  C('ieeevr', 'IEEE VR', 'A', 'A', [[8, 30]], 90, '#xr @nr_rt @am_motion', { home: 'hci', full: 'IEEE Virtual Reality' });
  C('iui', 'IUI', 'B', 'B', [[8, 20]], 80, 'hci #haic', { full: 'ACM Conference on Intelligent User Interfaces' });
  C('mobilehci', 'MobileHCI', 'B', 'B', [[2, 17]], 90, 'hci', { full: 'ACM International Conference on Mobile Human-Computer Interaction' });
  C('icwsm', 'ICWSM', 'B', 'B', [[1, 15], [5, 15], [9, 15]], 80, '#social @ag_sim', { home: 'hci', full: 'The International AAAI Conference on Web and Social Media' });
  C('percom', 'PerCom', 'B', 'B', [[9, 18]], 90, '#wear #sensing @sl_edge', { home: 'hci', full: 'IEEE International Conference on Pervasive Computing and Communications' });
  C('ismar', 'ISMAR', 'B', 'B', [[3, 16]], 90, '#xr @nr_rt', { home: 'hci', full: 'International Symposium on Mixed and Augmented Reality' });
  C('dis', 'DIS', 'C', 'C', [[1, 18]], 80, 'hci', { full: 'ACM Conference on Designing Interactive Systems' });
  C('assets', 'ASSETS', 'C', 'C', [[4, 22]], 80, '#access', { home: 'hci', full: 'ACM SIGACCESS Conference on Computers and Accessibility' });
  C('sigcse', 'SIGCSE', 'C', null, [[7, 3]], 80, '#edu @cg_gen', { home: 'hci', full: 'Technical Symposium on Computer Science Education Conference' });
  J('tochi', 'TOCHI', 'A', 'A', 240, 'hci', { full: 'ACM Transactions on Computer-Human Interaction' });
  J('ijhcs', 'IJHCS', 'A', 'A', 220, 'hci', { full: 'International Journal of Human-Computer Studies' });
  W('hci_ws', 'CHI Late-Breaking Work', [[1, 25]], 35, 'hci');

  // —— 机器人 ——
  C('rss', 'RSS', 'A', null, [[1, 30]], 75, 'robo', { full: 'Robotics Science and Systems' });
  C('corl', 'CoRL', 'A', null, [[5, 28]], 90, 'robo @rl_model @rl_off @vg_world', { rebuttal: true, full: 'The Conference on Robot Learning' });
  C('icra', 'ICRA', 'B', 'B', [[9, 15]], 130, 'robo #ad', { bar: 2, cm: 1.4, full: 'IEEE International Conference on Robotics and Automation' });
  C('iros', 'IROS', 'C', 'C', [[3, 1]], 120, 'robo #ad', { full: 'IEEE/RSJ International Conference on Intelligent Robots and Systems' });
  C('humanoids', 'Humanoids', 'C', null, [[7, 1]], 75, '#humanoid #legged', { home: 'robo', full: 'IEEE-RAS International Conference on Humanoid Robots' });
  J('tro', 'T-RO', 'B', 'B', 270, 'robo', { full: 'IEEE Transactions on Robotics' });
  J('ijrr', 'IJRR', 'A', null, 300, 'robo', { full: 'International Journal of Robotics Research' });
  J('ral', 'RA-L', 'C', null, 90, 'robo', { full: 'IEEE Robotics and Automation Letters' });
  W('rob_ws', 'Robotics Workshop', [[4, 1]], 30, 'robo');

  // —— 数据库与数据挖掘 ——
  C('sigmod', 'SIGMOD', 'A', 'A', [[1, 17], [4, 17], [7, 17], [10, 17]], 75, 'db @st_kv @st_ai', { full: 'ACM Conference on Management of Data' });
  C('vldb', 'VLDB', 'A', 'A', [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1]], 70, 'db @st_kv @st_ai', { full: 'International Conference on Very Large Data Bases' });
  C('icde', 'ICDE', 'A', 'A', [[6, 11], [11, 11]], 90, 'db @st_kv', { full: 'IEEE International Conference on Data Engineering' });
  C('kdd', 'KDD', 'A', 'A', [[2, 8], [7, 31]], 95, 'db #gnn #sci #fl', { rebuttal: true, full: 'ACM Knowledge Discovery and Data Mining' });
  C('www', 'WWW', 'A', 'A', [[10, 7]], 95, 'db #social #rag #agent @ms_measure @ms_censor @ms_cdn @ls_wm @mw_android', { rebuttal: true, full: 'International World Wide Web Conferences' });
  C('sigir', 'SIGIR', 'A', 'A', [[1, 22]], 85, '#rec #vecdb #rag @lb_table', { rebuttal: true, home: 'db', full: 'International Conference on Research on Development in Information' });
  C('cikm', 'CIKM', 'B', 'B', [[5, 23]], 75, 'db #rag', { full: 'ACM International Conference on Information and Knowledge Management' });
  C('wsdm', 'WSDM', 'B', 'B', [[8, 24]], 70, 'db', { full: 'International Conference on Web Search and Data Mining' });
  C('icdm', 'ICDM', 'B', 'B', [[6, 6]], 90, 'db #gnn', { full: 'IEEE International Conference on Data Mining' });
  C('sdm', 'SDM', 'B', 'B', [[10, 4]], 80, 'db', { full: 'SIAM International Conference on Data Mining' });
  C('recsys', 'RecSys', 'B', 'B', [[4, 21]], 75, '#rec', { home: 'db', full: 'ACM Conference on Recommender Systems' });
  C('ecmlpkdd', 'ECML-PKDD', 'B', 'B', [[3, 12]], 80, 'db ml', { full: 'European Conference on Machine Learning and 25th Principles and Practice' });
  C('dasfaa', 'DASFAA', 'B', 'B', [[11, 25]], 80, 'db', { full: 'Database Systems for Advanced Applications' });
  C('edbt', 'EDBT', 'B', 'B', [[2, 4], [6, 10], [10, 7]], 80, 'db', { full: 'International Conference on Extending Database Technology' });
  C('pods', 'PODS', 'B', 'B', [[5, 30], [12, 10]], 80, '#qo #lake @cc_fine', { home: 'db', full: 'ACM Symposium on Principles of Database Systems' });
  C('cidr', 'CIDR', 'B', 'B', [[8, 4]], 60, 'db', { full: 'International Conference on Innovative Data Systems Research' });
  C('pakdd', 'PAKDD', 'C', 'C', [[11, 20]], 80, 'db', { full: 'Pacific-Asia Conference on Knowledge Discovery and Data Mining' });
  C('ecir', 'ECIR', 'C', 'C', [[10, 6]], 80, '#rec #rag @vd_ann', { home: 'db', full: 'European Conference on Information Retrieval' });
  J('tkde', 'TKDE', 'A', 'A', 240, 'db', { full: 'IEEE Transactions on Knowledge and Data Engineering' });
  J('tods', 'TODS', 'A', 'A', 260, 'db', { full: 'ACM Transactions on Database Systems' });
  J('tois', 'TOIS', 'A', 'A', 220, '#rec #rag #vecdb', { home: 'db', full: 'ACM Transactions on Information Systems' });
  J('vldbj', 'VLDB Journal', 'A', 'A', 240, 'db', { full: 'The VLDB Journal' });
  W('db_ws', 'DB Workshop', [[3, 1]], 30, 'db');

  // —— 体系结构 ——
  C('isca', 'ISCA', 'A', 'A', [[11, 17]], 100, 'arch', { full: 'International Symposium on Computer Architecture' });
  C('micro', 'MICRO', 'A', 'A', [[4, 7]], 100, 'arch', { full: 'IEEE/ACM International Symposium on Microarchitecture' });
  C('hpca', 'HPCA', 'A', 'A', [[7, 31]], 90, 'arch', { full: 'IEEE International Symposium on High-Performance Computer Architecture' });
  C('dac', 'DAC', 'A', 'A', [[11, 19]], 100, 'arch', { full: 'Design Automation Conference' });
  C('iccad', 'ICCAD', 'B', 'B', [[4, 14]], 90, 'arch', { full: 'IEEE/ACM International Conference on Computer-Aided Design' });
  C('date', 'DATE', 'B', 'B', [[9, 20]], 90, 'arch', { full: 'Design, Automation & Test in Europe' });
  C('fpga', 'FPGA', 'B', 'B', [[10, 8]], 75, '#accel #sparse #riscv', { home: 'arch', full: 'ACM/SIGDA International Symposium on Field-Programmable Gate Arrays' });
  C('pact', 'PACT', 'B', 'B', [[4, 30]], 80, '#compiler #mem #accel', { home: 'arch', full: 'International Conference on Parallel Architectures and Compilation' });
  C('ics', 'ICS', 'B', 'B', [[12, 7]], 80, '#compiler #dtrain #accel #sparse', { home: 'arch', full: 'ACM International Conference on Supercomputing' });
  C('cgo', 'CGO', 'B', 'B', [[6, 11], [9, 10]], 80, '#compiler @rv_vec @sx_mm', { home: 'sys', full: 'The International Symposium on Code Generation and Optimization' });
  C('codesisss', 'CODES+ISSS', 'B', 'B', [[3, 30]], 80, '#accel #eda', { home: 'arch', full: 'International Conference on Hardware/Software Co-design and System' });
  C('iccd', 'ICCD', 'B', 'B', [[6, 10]], 80, 'arch', { full: 'International Conference on Computer Design' });
  C('aspdac', 'ASP-DAC', 'C', 'C', [[7, 18]], 80, 'arch', { full: 'Asia and South Pacific Design Automation Conference' });
  J('tc', 'IEEE TC', 'A', 'A', 240, 'arch', { full: 'IEEE Transactions on Computers' });
  J('tcad', 'TCAD', 'A', 'A', 210, 'arch', { full: 'IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems' });
  J('taco', 'TACO', 'A', 'A', 200, 'arch #compiler', { full: 'ACM Transactions on Architecture and Code Optimization' });
  W('arch_ws', 'Arch Workshop', [[2, 1]], 30, 'arch');

  // —— 软件工程 / 程序语言 ——
  C('icse', 'ICSE', 'A', 'A', [[3, 14], [7, 18]], 100, 'se #fuzz #supply', { full: 'International Conference on Software Engineering' });
  C('fse', 'FSE', 'A', 'A', [[9, 11]], 100, 'se #fuzz #supply', { full: 'ACM International Conference on the Foundations of Software Engineering' });
  C('ase', 'ASE', 'A', 'A', [[3, 26]], 80, 'se #fuzz', { full: 'International Conference on Automated Software Engineering' });
  C('issta', 'ISSTA', 'A', 'A', [[1, 11]], 80, 'se #fuzz', { full: 'ACM SIGSOFT International Symposium on Software Testing and Analysis' });
  C('pldi', 'PLDI', 'A', 'A', [[11, 13]], 100, '#sesmart #analysis #compiler @os_rust @os_verify', { home: 'se', full: 'ACM SIGPLAN Conference on Programming Language Design & Implementation' });
  C('popl', 'POPL', 'A', 'A', [[7, 10]], 85, '#sesmart #logic @an_static', { home: 'se', full: 'ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages' });
  C('oopsla', 'OOPSLA', 'A', 'A', [[3, 17], [10, 10]], 110, '#sesmart #analysis #testing', { home: 'se', full: 'Conference on Object-Oriented Programming Systems, Languages, and Applications' });
  C('icfp', 'ICFP', 'B', 'B', [[2, 25]], 90, '#sesmart', { home: 'se', full: 'International Conference on Function Programming' });
  C('ecoop', 'ECOOP', 'B', 'B', [[2, 11], [11, 19]], 80, '#sesmart #analysis', { home: 'se', full: 'European Conference on Object-Oriented Programming' });
  C('sas', 'SAS', 'B', 'B', [[5, 7]], 70, '#analysis @pl_verify', { home: 'se', full: 'International Static Analysis Symposium' });
  C('vmcai', 'VMCAI', 'B', 'B', [[9, 23], [9, 30]], 70, '#analysis #logic', { home: 'se', full: 'International Conference on Verification, Model Checking, and Abstract' });
  C('saner', 'SANER', 'B', 'B', [[9, 25]], 70, 'se', { full: 'IEEE International Conference on Software Analysis, Evolution and Reengineering' });
  C('icsme', 'ICSME', 'B', 'B', [[3, 5]], 75, 'se', { full: 'International Conference on Software Maintenance and Evolution' });
  C('icpc', 'ICPC', 'B', 'B', [[11, 5]], 70, 'se', { full: 'IEEE International Conference on Program Comprehension' });
  C('esem', 'ESEM', 'B', 'B', [[5, 18]], 70, 'se', { full: 'International Symposium on Empirical Software Engineering and Measurement' });
  C('issre', 'ISSRE', 'B', 'B', [[4, 24]], 80, '#testing #apr @sc_rel', { home: 'se', full: 'International Symposium on Software Reliability Engineering' });
  C('msr', 'MSR', 'C', 'C', [[10, 23]], 70, '#oss #codellm', { home: 'se', full: 'International Conference on Mining Software Repositories' });
  C('icst', 'ICST', 'C', 'C', [[11, 2]], 70, '#testing', { home: 'se', full: 'IEEE International Conference on Software Testing, Verification and' });
  J('tse', 'TSE', 'A', 'A', 270, 'se', { full: 'IEEE Transactions on Software Engineering' });
  J('tosem', 'TOSEM', 'A', 'A', 250, 'se', { full: 'ACM Transactions on Software Engineering and Methodology' });
  J('toplas', 'TOPLAS', 'A', 'A', 270, '#sesmart #analysis', { home: 'se', full: 'ACM Transactions on Programming Languages and Systems' });
  W('se_ws', 'SE Workshop', [[2, 20]], 30, 'se');

  // —— 图形学 ——
  C('siggraph', 'SIGGRAPH', 'A', 'A', [[1, 22]], 75, 'graphics #3d @pose_mesh @pose_motion', { full: 'ACM SIGGRAPH Annual Conference' });
  C('sigasia', 'SIGGRAPH Asia', 'A', null, [[5, 12]], 85, 'graphics #3d @pose_mesh @pose_motion', { full: 'ACM SIGGRAPH Annual Conference in Asia' });
  C('vis', 'IEEE VIS', 'A', 'A', [[3, 31]], 95, '#vis #visu', { home: 'graphics', full: 'IEEE Visualization Conference' });
  C('eg', 'Eurographics', 'B', 'B', [[10, 2]], 75, 'graphics', { full: 'Eurographics' });
  C('pg', 'Pacific Graphics', 'B', 'B', [[6, 8]], 75, 'graphics', { full: 'Pacific Graphics, The Pacific Conference on Computer Graphics and Applications' });
  C('egsr', 'EGSR', 'B', 'B', [[4, 15]], 60, '#nrender', { home: 'graphics', full: 'Eurographics Symposium on Rendering' });
  C('sca', 'SCA', 'B', 'B', [[4, 17]], 60, '#anim #sim', { home: 'graphics', full: 'ACM SIGGRAPH/Eurographics Symposium on Computer Animation' });
  C('sgp', 'SGP', 'B', 'B', [[4, 15]], 60, '#geo', { home: 'graphics', full: 'Eurographics Symposium on Geometry Processing' });
  C('eurovis', 'EuroVis', 'B', 'B', [[12, 3]], 80, '#vis #visu', { home: 'graphics', full: 'Eurographics Conference on Visualization' });
  C('pacificvis', 'PacificVis', 'C', 'C', [[11, 9]], 70, '#vis #visu', { home: 'graphics', full: 'IEEE Pacific Visualization Symposium' });
  C('cgi', 'CGI', 'C', 'C', [[4, 20]], 70, 'graphics', { full: 'Computer Graphics International' });
  J('tog', 'ACM TOG', 'A', 'A', 240, 'graphics', { full: 'ACM Transactions on Graphics' });
  J('tvcg', 'TVCG', 'A', 'A', 210, 'graphics #vis #xr', { full: 'IEEE Transactions on Visualization and Computer Graphics' });
  W('gr_ws', 'Graphics Workshop', [[8, 15]], 30, 'graphics');

  // —— 计算机网络 ——
  C('sigcomm', 'SIGCOMM', 'A', 'A', [[2, 6]], 105, 'net @dt_comm @cx_rdma', { full: 'ACM International Conference on Applications, Technologies, Architectures,' });
  C('mobicom', 'MobiCom', 'A', 'A', [[3, 13], [9, 3]], 110, 'net @we_health @sv_edge', { full: 'ACM Annual International Conference On Mobile Computing And Networking' });
  C('infocom', 'INFOCOM', 'A', 'A', [[7, 31]], 130, 'net', { full: 'IEEE International Conference on Computer Communications' });
  C('mobisys', 'MobiSys', 'B', 'B', [[12, 4]], 90, '#wireless #sensing @sv_edge @we_health', { home: 'net', full: 'ACM International Conference on Mobile Systems, Applications, and Services' });
  C('sensys', 'SenSys', 'B', 'B', [[6, 5], [11, 5]], 90, '#sensing #wireless', { home: 'net', full: 'ACM Conference on Embedded Networked Sensor Systems' });
  C('conext', 'CoNEXT', 'B', 'B', [[6, 4], [12, 4]], 75, 'net', { full: 'International Conference on Emerging Networking Experiments and Technologies' });
  C('icnp', 'ICNP', 'B', 'B', [[5, 22]], 80, 'net', { full: 'IEEE International Conference on Network Protocols' });
  C('imc', 'IMC', 'B', 'B', [[4, 29], [11, 20]], 80, '#meas #video #wireless @mw_android', { home: 'net', full: 'ACM Internet Measurement Conference' });
  C('iwqos', 'IWQoS', 'B', 'B', [[2, 23]], 70, 'net', { full: 'IEEE/ACM International Symposium on Quality of Service' });
  C('secon', 'SECON', 'B', 'B', [[11, 30]], 80, '#wireless #sensing', { home: 'net', full: 'IEEE International Conference on Sensing, Communication, and Networking' });
  C('mobihoc', 'MobiHoc', 'B', 'B', [[4, 6]], 80, '#wireless', { home: 'net', full: 'International Symposium on Mobile Ad Hoc Networking and Computing' });
  C('nossdav', 'NOSSDAV', 'B', 'B', [[1, 11]], 60, '#video', { home: 'net', full: 'International Workshop on Network and Operating System Support for' });
  C('ipsn', 'IPSN', 'B', 'B', [[10, 30]], 80, '#sensing', { home: 'net', full: 'ACM/IEEE International Conference on Information Processing in Sensor' });
  C('mmsys', 'MMSys', 'C', null, [[9, 17], [11, 19]], 70, '#video', { home: 'net', full: 'ACM International Conference on Multimedia Systems' });
  C('hotnets', 'HotNets', 'C', 'C', [[7, 16]], 45, 'net', { full: 'ACM Workshop on Hot Topics in Networks' });
  C('icc', 'ICC', 'C', 'C', [[10, 16]], 90, '#wireless', { home: 'net', full: 'IEEE International Conference on Communications' });
  C('globecom', 'GLOBECOM', 'C', 'C', [[5, 3]], 90, '#wireless #dcn', { home: 'net', full: 'IEEE Global Communications Conference' });
  J('ton', 'IEEE/ACM ToN', 'A', 'A', 260, 'net', { full: 'IEEE/ACM Transactions on Networking' });
  J('jsac', 'JSAC', 'A', 'A', 210, '#wireless #sensing #video', { home: 'net', full: 'IEEE Journal on Selected Areas in Communications' });
  J('tmc', 'TMC', 'A', 'A', 230, '#wireless #sensing #video', { home: 'net', full: 'IEEE Transactions on Mobile Computing' });
  W('net_ws', 'SIGCOMM Workshop', [[4, 1]], 35, 'net');

  // —— 交叉学科 ——
  C('ismb', 'ISMB', 'B', 'B', [[1, 14]], 90, '@sci_bio @gnn_mol', { home: 'ml', full: 'International Conference on Intelligent Systems for Molecular Biology' });
  C('recomb', 'RECOMB', 'B', 'B', [[11, 4]], 80, '@sci_bio', { home: 'ml', full: 'International Conference on Research inComputational Molecular Biology' });
  C('bibm', 'BIBM', 'B', 'B', [[7, 5]], 70, '@sci_bio @gnn_mol #med', { home: 'ml', full: 'IEEE International Conference on Bioinformatics and Biomedicine' });

  // ---------- 投稿范围 ----------
  // 某个子方向能投哪些地方：本领域 / 整个领域都收的、收这个方向的、收这个子方向的
  RS.venueFits = (v, sid) => {
    const s = RS.SUBS[sid];
    if (!s || !v.areas) return false;
    return v.areas.includes(s.area) || v.topics.includes(s.topic) || v.subs.includes(sid);
  };
  // 每个领域的“常投”列表：本领域的会议 + 收这个领域里某些方向的跨方向会议
  Object.values(RS.AREAS).forEach(A => {
    A.venues = Object.values(VENUES).filter(v => v.areas && (v.areas.includes(A.id) || A.subs.some(s => v.topics.includes(s.topic) || v.subs.includes(s.id)))).map(v => v.id);
  });
  // 写错的方向 / 子方向 id
  Object.values(VENUES).forEach(v => {
    (v.topics || []).forEach(t => { if (!Object.values(RS.AREAS).some(A => A.topics.some(x => x.id === t))) console.warn('会议范围里没有这个方向', v.id, t); });
    (v.subs || []).forEach(s => { if (!RS.SUBS[s]) console.warn('会议范围里没有这个子方向', v.id, s); });
    (v.areas || []).forEach(a => { if (!RS.AREAS[a]) console.warn('会议范围里没有这个领域', v.id, a); });
  });
})();
