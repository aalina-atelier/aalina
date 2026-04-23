import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Shirt, ChevronRight, Loader2, Plus, X, Wand2, Check, Image as ImageIcon, Upload } from 'lucide-react';

export default function PersonalStylist() {
  const [step, setStep] = useState('welcome');
  const [profile, setProfile] = useState({
    name: '', bodyType: '', colorType: '', height: '',
    preferredStyles: [], budget: '', notes: '',
    lovedColors: [], avoidedColors: []
  });
  const [wardrobe, setWardrobe] = useState([]);
  const [references, setReferences] = useState([]);
  const [referenceAnalysis, setReferenceAnalysis] = useState(null);
  const [newItem, setNewItem] = useState({ type: '', color: '', description: '', photo: null, photoData: null, photoMediaType: null });
  const [currentLook, setCurrentLook] = useState(null);
  const [currentOutfit, setCurrentOutfit] = useState(null);
  const [wardrobeAnalysis, setWardrobeAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [selectedOccasion, setSelectedOccasion] = useState('');
  const [analyzingItem, setAnalyzingItem] = useState(false);
  const fileInputRef = useRef(null);
  const itemPhotoRef = useRef(null);

  useEffect(() => {
    const load = () => {
      try {
        const p = localStorage.getItem('stylist:profile');
        if (p) { setProfile(JSON.parse(p)); setStep('dashboard'); }
        const w = localStorage.getItem('stylist:wardrobe');
        if (w) setWardrobe(JSON.parse(w));
        const r = localStorage.getItem('stylist:references');
        if (r) setReferences(JSON.parse(r));
        const a = localStorage.getItem('stylist:refAnalysis');
        if (a) setReferenceAnalysis(JSON.parse(a));
      } catch (e) {}
    };
    load();
  }, []);

  const save = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  };

  const callClaude = async (prompt, systemPrompt, images) => {
    const content = images && images.length > 0
      ? [...images.map(img => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } })), { type: "text", text: prompt }]
      : prompt;
    const response = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        system: systemPrompt,
        messages: [{ role: "user", content }]
      })
    });
    const data = await response.json();
    const text = data.content.map(i => i.text || "").join("\n");
    return text.replace(/```json|```/g, "").trim();
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const newRefs = await Promise.all(files.map(file => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target.result;
        const [header, base64] = result.split(',');
        const mediaType = header.match(/data:(.*?);/)[1];
        resolve({ id: Date.now() + Math.random(), data: base64, mediaType, preview: result, tag: '', note: '' });
      };
      reader.readAsDataURL(file);
    })));
    const updated = [...references, ...newRefs];
    setReferences(updated);
    save('stylist:references', updated);
    setReferenceAnalysis(null);
    save('stylist:refAnalysis', null);
  };

  const removeReference = (id) => {
    const updated = references.filter(r => r.id !== id);
    setReferences(updated);
    save('stylist:references', updated);
    setReferenceAnalysis(null);
    save('stylist:refAnalysis', null);
  };

  const updateReference = (id, changes) => {
    const updated = references.map(r => r.id === id ? { ...r, ...changes } : r);
    setReferences(updated);
    save('stylist:references', updated);
  };

  const analyzeItemPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzingItem(true);
    setError('');
    try {
      // Читаем файл как base64
      const { base64, mediaType, preview } = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target.result;
          const [header, data] = result.split(',');
          const mt = header.match(/data:(.*?);/)[1];
          resolve({ base64: data, mediaType: mt, preview: result });
        };
        reader.readAsDataURL(file);
      });

      const prompt = `Проанализируй эту вещь одежды/аксессуар. Определи её характеристики.

Возможные типы (выбери ОДИН наиболее подходящий): ${itemCategories.join(', ')}.

Верни JSON:
{
  "type": "тип из списка выше",
  "color": "основной цвет (одно-два слова, например 'тёмно-синий' или 'кремовый')",
  "description": "краткое описание: материал, крой, детали (15-20 слов)"
}`;
      
      const result = await callClaude(prompt, 'Ты — стилист-эксперт по анализу одежды. Отвечай ТОЛЬКО валидным JSON.', [{ data: base64, mediaType }]);
      const parsed = JSON.parse(result);
      
      setNewItem({
        type: parsed.type || '',
        color: parsed.color || '',
        description: parsed.description || '',
        photo: preview,
        photoData: base64,
        photoMediaType: mediaType
      });
    } catch (err) {
      setError('Не удалось проанализировать фото. Попробуй ещё раз или заполни вручную.');
      console.error(err);
    }
    setAnalyzingItem(false);
    // Сбрасываем input, чтобы можно было загрузить ту же фотографию ещё раз
    if (itemPhotoRef.current) itemPhotoRef.current.value = '';
  };

  const analyzeReferences = async () => {
    if (!references.length) { setError('Добавь хотя бы одну картинку'); return; }
    setLoading(true); setError('');
    try {
      const tagsContext = references.some(r => r.tag || r.note)
        ? `\n\nТеги и заметки клиента к картинкам:\n${references.map((r, i) => `Картинка ${i+1}: ${r.tag ? `[${r.tag}]` : ''} ${r.note || ''}`.trim()).filter(s => s.includes('[') || s.includes(':')).join('\n')}`
        : '';
      const prompt = `Проанализируй эти ${references.length} референсов стиля. Определи общий эстетический вектор.${tagsContext}

Верни JSON:
{"aestheticSummary":"описание эстетики в 2-3 предложения","keyStyles":["стиль1","стиль2","стиль3"],"dominantColors":["цвет1","цвет2","цвет3","цвет4"],"silhouettes":"описание силуэтов","materials":["м1","м2","м3"],"vibeKeywords":["слово1","слово2","слово3","слово4","слово5"],"styleFormula":"короткая формула стиля"}`;
      const result = await callClaude(prompt, 'Ты — стилист-аналитик. Отвечай ТОЛЬКО валидным JSON.', references);
      const parsed = JSON.parse(result);
      setReferenceAnalysis(parsed);
      save('stylist:refAnalysis', parsed);
    } catch (e) { setError('Не удалось. Попробуй ещё раз.'); }
    setLoading(false);
  };

  const generateLook = async (styleName, occasion) => {
    setLoading(true); setError('');
    try {
      const refCtx = referenceAnalysis ? `\nРеференсы клиента: ${referenceAnalysis.styleFormula}. Настроение: ${referenceAnalysis.vibeKeywords.join(', ')}.` : '';
      const prompt = `Создай образ в стиле "${styleName}" для "${occasion}".

Клиент: фигура ${profile.bodyType || '?'}, цветотип ${profile.colorType || '?'}, рост ${profile.height || '?'}, бюджет ${profile.budget || 'средний'}.
Стили: ${profile.preferredStyles.join(', ') || 'универсальный'}.
Любимые цвета: ${profile.lovedColors?.join(', ') || 'не указаны'}.
ИЗБЕГАТЬ цвета: ${profile.avoidedColors?.join(', ') || 'нет'}.
Заметки: ${profile.notes || ''}${refCtx}

Верни JSON:
{"name":"название","mood":"настроение","palette":["#hex1","#hex2","#hex3","#hex4"],"items":[{"category":"Верх","name":"вещь","color":"цвет","why":"почему"},{"category":"Низ","name":"...","color":"...","why":"..."},{"category":"Обувь","name":"...","color":"...","why":"..."},{"category":"Верхняя одежда","name":"...","color":"...","why":"..."},{"category":"Аксессуары","name":"...","color":"...","why":"..."}],"stylingTips":["с1","с2","с3"],"personalNote":"персональное обращение"}`;
      const result = await callClaude(prompt, 'Ты — стилист уровня Vogue. Отвечай ТОЛЬКО валидным JSON.');
      setCurrentLook(JSON.parse(result));
    } catch (e) { setError('Не удалось. Попробуй ещё раз.'); }
    setLoading(false);
  };

  const analyzeWardrobe = async () => {
    if (wardrobe.length < 3) { setError('Добавь хотя бы 3 вещи'); return; }
    setLoading(true); setError('');
    try {
      const prompt = `Проанализируй гардероб.
Клиент: фигура ${profile.bodyType}, цветотип ${profile.colorType}, любимые цвета ${profile.lovedColors?.join(', ') || '?'}.
Гардероб:
${wardrobe.map((w, i) => `${i+1}. ${w.type} — ${w.color} (${w.description || ''})`).join('\n')}

JSON: {"summary":"оценка","strengths":["с1","с2","с3"],"gaps":["г1","г2","г3"],"colorHarmony":"анализ","recommendations":[{"item":"что","why":"почему"},{"item":"...","why":"..."},{"item":"...","why":"..."}],"capsuleAdvice":"совет"}`;
      const result = await callClaude(prompt, 'Ты — стилист. Отвечай ТОЛЬКО валидным JSON.');
      setWardrobeAnalysis(JSON.parse(result));
    } catch (e) { setError('Не удалось. Попробуй ещё раз.'); }
    setLoading(false);
  };

  const createOutfitFromWardrobe = async (occasion) => {
    if (wardrobe.length < 3) { setError('Добавь хотя бы 3 вещи'); return; }
    setLoading(true); setError('');
    try {
      const refCtx = referenceAnalysis ? `\nЭстетика референсов: ${referenceAnalysis.styleFormula}.` : '';
      
      const itemsWithPhotos = wardrobe.filter(w => w.photoData);
      const photoContext = itemsWithPhotos.length > 0 
        ? `\n\nВАЖНО: у клиента есть фотографии некоторых вещей. Учитывай их реальный вид при составлении образа.`
        : '';
      
      const prompt = `Составь полный образ для "${occasion}", используя вещи клиента КАК ОСНОВУ и ПРЕДЛАГАЯ ДОКУПИТЬ недостающие элементы.

Клиент: фигура ${profile.bodyType}, цветотип ${profile.colorType}, рост ${profile.height || '?'}, бюджет ${profile.budget || 'средний'}.
Любимые цвета: ${profile.lovedColors?.join(', ') || 'не указаны'}.
Избегать цвета: ${profile.avoidedColors?.join(', ') || 'нет'}.${refCtx}${photoContext}

Вещи клиента:
${wardrobe.map((w, i) => `${i+1}. ${w.type} — ${w.color} (${w.description || ''})${w.photoData ? ' [есть фото]' : ''}`).join('\n')}

ЗАДАЧА: 
1. Выбери подходящие вещи из гардероба клиента (хотя бы 2-3 — это основа образа)
2. Определи, какие ЕЩЁ вещи нужны для полного завершённого образа, которых нет в гардеробе
3. Для каждой рекомендуемой к покупке вещи дай конкретное описание: что именно купить, в каком цвете, из какого материала, примерный ценовой сегмент (в рамках бюджета клиента)

Верни JSON:
{
  "outfitName": "название образа",
  "ownedItems": [{"index": номер_из_списка, "role": "роль в образе"}],
  "itemsToBuy": [
    {"category": "категория (например Обувь, Аксессуар)", "item": "конкретное описание что купить", "color": "цвет", "details": "материал, крой, детали", "priceRange": "примерная цена в бюджете клиента", "why": "почему именно эта вещь нужна для образа"}
  ],
  "whyItWorks": "почему этот образ удачен для клиента (2-3 предложения про фигуру, цветотип, настроение)",
  "stylingDetails": ["как носить — деталь 1", "деталь 2", "деталь 3"],
  "shoppingTip": "один практический совет по шопингу — где искать или на что смотреть при покупке"
}

Если в гардеробе уже есть всё нужное — itemsToBuy может быть пустым массивом [].`;
      
      const images = itemsWithPhotos.map(w => ({ data: w.photoData, mediaType: w.photoMediaType }));
      const result = await callClaude(prompt, 'Ты — персональный шоппинг-стилист. Составляй образы из имеющихся вещей клиента плюс конкретные рекомендации что докупить. Отвечай ТОЛЬКО валидным JSON.', images.length > 0 ? images : undefined);
      setCurrentOutfit(JSON.parse(result));
    } catch (e) { setError('Не удалось. Попробуй ещё раз.'); }
    setLoading(false);
  };

  const styleOptions = ['Old Money', 'Минимализм', 'Street Style', 'Романтичный', 'Богемный', 'Бизнес-кэжуал', 'Скандинавский', 'Parisian Chic', 'Y2K', 'Гранж', 'Спортивный шик', 'Классика'];
  const occasions = ['Работа', 'Свидание', 'Прогулка', 'Встреча с друзьями', 'Важная встреча', 'Отпуск', 'Ресторан', 'Творческое событие'];
  const bodyTypes = ['Песочные часы', 'Груша', 'Яблоко', 'Прямоугольник', 'Перевёрнутый треугольник'];
  const colorTypes = ['Весна', 'Лето', 'Осень', 'Зима', 'Не знаю'];
  const itemCategories = ['Футболка/топ', 'Рубашка', 'Свитер', 'Пиджак', 'Пальто/куртка', 'Джинсы', 'Брюки', 'Юбка', 'Платье', 'Обувь', 'Сумка', 'Аксессуар'];
  const referenceTags = ['Работа', 'На выход', 'Повседневное', 'Особый случай', 'Отпуск', 'Спорт'];
  const colorPalette = [
    { name: 'Чёрный', hex: '#1a1612' }, { name: 'Белый', hex: '#f5f1ea' },
    { name: 'Серый', hex: '#8b8680' }, { name: 'Графит', hex: '#3d3d3d' },
    { name: 'Кремовый', hex: '#e8dcc4' }, { name: 'Бежевый', hex: '#d4b896' },
    { name: 'Коричневый', hex: '#6b4423' }, { name: 'Шоколад', hex: '#3d2817' },
    { name: 'Хаки', hex: '#8b7d5c' }, { name: 'Терракот', hex: '#c06550' },
    { name: 'Ржавый', hex: '#b7410e' }, { name: 'Красный', hex: '#a63838' },
    { name: 'Бордо', hex: '#5c1a1b' }, { name: 'Розовый', hex: '#e8b4b8' },
    { name: 'Пудровый', hex: '#f2d7d5' }, { name: 'Фуксия', hex: '#c2185b' },
    { name: 'Оранжевый', hex: '#d97706' }, { name: 'Горчица', hex: '#d4a017' },
    { name: 'Жёлтый', hex: '#f0c420' }, { name: 'Мятный', hex: '#a8d5ba' },
    { name: 'Оливковый', hex: '#6b7e42' }, { name: 'Шалфей', hex: '#9caf88' },
    { name: 'Изумруд', hex: '#2d5d4f' }, { name: 'Зелёный', hex: '#4a6b3a' },
    { name: 'Небесный', hex: '#a8c5d9' }, { name: 'Голубой', hex: '#5b8fb0' },
    { name: 'Синий', hex: '#1e3a5f' }, { name: 'Navy', hex: '#0f1f3d' },
    { name: 'Лавандовый', hex: '#b4a7d6' }, { name: 'Фиолетовый', hex: '#5e3370' },
    { name: 'Золото', hex: '#b8860b' }, { name: 'Серебро', hex: '#a8a8a8' }
  ];

  const btn = (variant) => {
    const base = { padding: '16px 28px', fontSize: '12px', letterSpacing: '0.3em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '10px', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' };
    if (variant === 'primary') return { ...base, backgroundColor: '#1a1612', color: '#f5f1ea' };
    if (variant === 'outline') return { ...base, backgroundColor: '#f5f1ea', color: '#1a1612', border: '2px solid #1a1612' };
    return base;
  };

  const Choice = ({ selected, onClick, children }) => (
    <button type="button" onClick={onClick} style={{
      padding: '12px 20px', fontSize: '14px', border: '2px solid #1a1612',
      backgroundColor: selected ? '#1a1612' : '#ffffff',
      color: selected ? '#f5f1ea' : '#1a1612',
      cursor: 'pointer', transition: 'all 0.15s',
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent'
    }}>
      {selected && <Check size={14} strokeWidth={2.5} />}
      {children}
    </button>
  );

  const Swatch = ({ color, selected, onClick, mode }) => {
    const isLight = ['#f5f1ea', '#e8dcc4', '#f2d7d5', '#a8d5ba', '#a8c5d9', '#e8b4b8'].includes(color.hex);
    return (
      <button type="button" onClick={onClick} style={{
        width: '64px', backgroundColor: 'transparent', border: 'none', padding: 0,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit'
      }}>
        <div style={{
          width: '64px', height: '64px', backgroundColor: color.hex,
          border: selected ? `3px solid ${mode === 'avoid' ? '#c1272d' : '#1a1612'}` : '1px solid #1a1612',
          boxShadow: selected ? `0 0 0 2px #f5f1ea, 0 0 0 4px ${mode === 'avoid' ? '#c1272d' : '#1a1612'}` : 'none',
          transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {selected && (
            <div style={{
              color: mode === 'avoid' ? '#fff' : (isLight ? '#1a1612' : '#fff'),
              backgroundColor: mode === 'avoid' ? '#c1272d' : 'transparent',
              width: mode === 'avoid' ? '26px' : 'auto',
              height: mode === 'avoid' ? '26px' : 'auto',
              borderRadius: mode === 'avoid' ? '50%' : 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {mode === 'avoid' ? <X size={16} strokeWidth={3} /> : <Check size={22} strokeWidth={3} />}
            </div>
          )}
        </div>
        <p style={{ fontSize: '11px', marginTop: '4px', textAlign: 'center', color: '#3d352c' }}>{color.name}</p>
      </button>
    );
  };

  const Back = ({ onClick }) => (
    <button type="button" onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      textTransform: 'uppercase', letterSpacing: '0.3em', fontSize: '10px',
      marginBottom: '28px', WebkitTapHighlightColor: 'transparent', color: '#1a1612'
    }}>← Назад</button>
  );

  // ============ WELCOME ============
  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-[#f5f1ea] text-[#1a1612] font-serif">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="border-t-2 border-b-2 border-[#1a1612] py-2 mb-10 flex justify-between items-center text-[10px] tracking-[0.3em] uppercase">
            <span>Vol. I</span><span>Atelier</span><span>№ 001</span>
          </div>
          <p className="text-xs tracking-[0.4em] uppercase mb-5 text-[#8b7355]">— Добро пожаловать —</p>
          <h1 className="text-5xl md:text-7xl leading-[0.95] mb-6 font-light">
            Твой личный<br/><span className="italic">стилист</span><br/>всегда рядом.
          </h1>
          <p className="text-base md:text-lg leading-relaxed max-w-xl text-[#3d352c] mb-10">
            Редакционный подход к гардеробу. Образы под твою фигуру, цветотип и вкус.
          </p>
          <button type="button" onClick={() => setStep('profile')} style={btn('primary')}>
            Начать <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ============ PROFILE ============
  if (step === 'profile') {
    const toggle = (field, value) => {
      const arr = profile[field] || [];
      setProfile({ ...profile, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] });
    };
    return (
      <div className="min-h-screen bg-[#f5f1ea] text-[#1a1612] font-serif">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <p className="text-xs tracking-[0.4em] uppercase mb-3 text-[#8b7355]">— Знакомство —</p>
          <h2 className="text-4xl md:text-5xl mb-2 font-light italic">Расскажи о себе</h2>
          <p className="text-[#3d352c] mb-8">Чем больше деталей — тем точнее образы.</p>

          <div className="space-y-8">
            <div>
              <label className="text-xs tracking-[0.3em] uppercase mb-2 block text-[#8b7355]">Имя</label>
              <input type="text" value={profile.name} onChange={(e) => setProfile({...profile, name: e.target.value})}
                className="w-full bg-transparent border-b-2 border-[#1a1612] py-2 text-xl italic focus:outline-none" placeholder="Твоё имя" />
            </div>

            <div>
              <label className="text-xs tracking-[0.3em] uppercase mb-3 block text-[#8b7355]">Тип фигуры</label>
              <div className="flex flex-wrap gap-2">
                {bodyTypes.map(t => <Choice key={t} selected={profile.bodyType === t} onClick={() => setProfile({...profile, bodyType: t})}>{t}</Choice>)}
              </div>
            </div>

            <div>
              <label className="text-xs tracking-[0.3em] uppercase mb-3 block text-[#8b7355]">Цветотип</label>
              <div className="flex flex-wrap gap-2">
                {colorTypes.map(t => <Choice key={t} selected={profile.colorType === t} onClick={() => setProfile({...profile, colorType: t})}>{t}</Choice>)}
              </div>
            </div>

            <div>
              <label className="text-xs tracking-[0.3em] uppercase mb-2 block text-[#8b7355]">Рост (см)</label>
              <input type="text" inputMode="numeric" value={profile.height} onChange={(e) => setProfile({...profile, height: e.target.value})}
                className="w-full bg-transparent border-b-2 border-[#1a1612] py-2 text-lg focus:outline-none" placeholder="170" />
            </div>

            <div>
              <label className="text-xs tracking-[0.3em] uppercase mb-3 block text-[#8b7355]">Любимые стили</label>
              <div className="flex flex-wrap gap-2">
                {styleOptions.map(s => <Choice key={s} selected={profile.preferredStyles.includes(s)} onClick={() => toggle('preferredStyles', s)}>{s}</Choice>)}
              </div>
            </div>

            <div>
              <label className="text-xs tracking-[0.3em] uppercase mb-3 block text-[#8b7355]">Бюджет</label>
              <div className="flex flex-wrap gap-2">
                {['Эконом', 'Средний', 'Премиум', 'Без ограничений'].map(b => <Choice key={b} selected={profile.budget === b} onClick={() => setProfile({...profile, budget: b})}>{b}</Choice>)}
              </div>
            </div>

            <div>
              <label className="text-xs tracking-[0.3em] uppercase mb-3 block text-[#8b7355]">Любимые цвета</label>
              <p className="text-sm text-[#3d352c] mb-3">Выбери цвета, в которых тебе хорошо.</p>
              <div className="flex flex-wrap gap-3">
                {colorPalette.map(c => (
                  <Swatch key={c.name} color={c} selected={profile.lovedColors?.includes(c.name)} mode="love"
                    onClick={() => {
                      const loved = profile.lovedColors?.includes(c.name)
                        ? profile.lovedColors.filter(v => v !== c.name)
                        : [...(profile.lovedColors || []), c.name];
                      const avoided = profile.avoidedColors?.includes(c.name)
                        ? profile.avoidedColors.filter(v => v !== c.name)
                        : (profile.avoidedColors || []);
                      setProfile({...profile, lovedColors: loved, avoidedColors: avoided});
                    }} />
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs tracking-[0.3em] uppercase mb-3 block text-[#8b7355]">Цвета, которых избегаешь</label>
              <p className="text-sm text-[#3d352c] mb-3">Эти цвета я не буду использовать в образах.</p>
              <div className="flex flex-wrap gap-3">
                {colorPalette.map(c => (
                  <Swatch key={c.name} color={c} selected={profile.avoidedColors?.includes(c.name)} mode="avoid"
                    onClick={() => {
                      const avoided = profile.avoidedColors?.includes(c.name)
                        ? profile.avoidedColors.filter(v => v !== c.name)
                        : [...(profile.avoidedColors || []), c.name];
                      const loved = profile.lovedColors?.includes(c.name)
                        ? profile.lovedColors.filter(v => v !== c.name)
                        : (profile.lovedColors || []);
                      setProfile({...profile, avoidedColors: avoided, lovedColors: loved});
                    }} />
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs tracking-[0.3em] uppercase mb-2 block text-[#8b7355]">Заметки</label>
              <textarea value={profile.notes} onChange={(e) => setProfile({...profile, notes: e.target.value})}
                className="w-full bg-transparent border-2 border-[#1a1612] p-3 text-base focus:outline-none min-h-[100px]"
                placeholder="Не люблю обтягивающее, работаю в офисе..." />
            </div>

            <button type="button" onClick={() => { save('stylist:profile', profile); setStep('dashboard'); }} style={btn('primary')}>
              Сохранить <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ DASHBOARD ============
  if (step === 'dashboard') {
    const card = (onClick, Icon, title, desc, meta, dark) => (
      <button type="button" onClick={onClick} style={{
        textAlign: 'left', padding: '28px', cursor: 'pointer', fontFamily: 'inherit',
        backgroundColor: dark ? '#1a1612' : '#f5f1ea',
        color: dark ? '#f5f1ea' : '#1a1612',
        border: dark ? 'none' : '2px solid #1a1612',
        WebkitTapHighlightColor: 'transparent'
      }}>
        <Icon size={26} strokeWidth={1.5} style={{marginBottom: '18px'}} />
        <h3 style={{fontSize: '20px', fontStyle: 'italic', marginBottom: '6px'}}>{title}</h3>
        <p style={{fontSize: '14px', marginBottom: '18px', color: dark ? '#d4c8b5' : '#3d352c'}}>{desc}</p>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase'}}>
          {meta} <ChevronRight size={12} />
        </div>
      </button>
    );
    return (
      <div className="min-h-screen bg-[#f5f1ea] text-[#1a1612] font-serif">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="border-t-2 border-b-2 border-[#1a1612] py-2 mb-10 flex justify-between items-center text-[10px] tracking-[0.3em] uppercase">
            <span>Atelier</span>
            <span>{profile.name || 'Гость'}</span>
            <button type="button" onClick={() => setStep('profile')}
              style={{background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.3em', fontSize: '10px', color: '#1a1612', WebkitTapHighlightColor: 'transparent'}}>
              Профиль
            </button>
          </div>
          <p className="text-xs tracking-[0.4em] uppercase mb-3 text-[#8b7355]">— Сегодня —</p>
          <h2 className="text-4xl md:text-5xl mb-10 font-light">
            Привет{profile.name ? `, ${profile.name}` : ''}.<br/><span className="italic">С чего начнём?</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {card(() => setStep('looks'), Wand2, 'Создать образ', 'Лук под любой стиль и повод.', 'Начать', true)}
            {card(() => setStep('references'), ImageIcon, 'Референсы стиля', 'Загрузи картинки — я изучу твой вкус.',
              references.length > 0 ? `${references.length} картинок${referenceAnalysis ? ' · проанализировано' : ''}` : 'Добавить', false)}
            {card(() => setStep('wardrobe'), Shirt, 'Мой гардероб', 'Добавь вещи — получи анализ.',
              wardrobe.length > 0 ? `${wardrobe.length} вещей` : 'Добавить', false)}
            {card(() => setStep('outfits'), Sparkles, 'Лук + докупка', 'Из моих вещей + что докупить.', 'Составить', false)}
          </div>
        </div>
      </div>
    );
  }

  // ============ REFERENCES ============
  if (step === 'references') {
    return (
      <div className="min-h-screen bg-[#f5f1ea] text-[#1a1612] font-serif">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <Back onClick={() => setStep('dashboard')} />
          <p className="text-xs tracking-[0.4em] uppercase mb-3 text-[#8b7355]">— Мудборд —</p>
          <h2 className="text-4xl md:text-5xl mb-2 font-light italic">Референсы</h2>
          <p className="text-[#3d352c] mb-6">Загрузи картинки желаемого стиля. Я изучу и буду учитывать.</p>

          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileUpload} style={{display: 'none'}} />
          <button type="button" onClick={() => fileInputRef.current?.click()} style={btn('primary')}>
            <Upload size={16} /> Загрузить
          </button>

          {references.length > 0 && (
            <>
              <div className="mt-8 mb-6">
                <p className="text-xs tracking-[0.3em] uppercase mb-4 text-[#8b7355]">Мудборд ({references.length})</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {references.map((ref) => (
                    <div key={ref.id} style={{border: '2px solid #1a1612', padding: '12px', backgroundColor: '#fff'}}>
                      <div style={{position: 'relative', marginBottom: '12px'}}>
                        <img src={ref.preview} alt="ref" style={{width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block'}} />
                        <button type="button" onClick={() => removeReference(ref.id)} style={{
                          position: 'absolute', top: '8px', right: '8px',
                          backgroundColor: '#1a1612', color: '#f5f1ea', width: '32px', height: '32px',
                          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          WebkitTapHighlightColor: 'transparent'
                        }}>
                          <X size={14} />
                        </button>
                      </div>
                      <p style={{fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#8b7355', marginBottom: '6px'}}>Категория</p>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px'}}>
                        {referenceTags.map(t => (
                          <button key={t} type="button"
                            onClick={() => updateReference(ref.id, { tag: ref.tag === t ? '' : t })}
                            style={{
                              padding: '4px 10px', fontSize: '11px', border: '1px solid #1a1612',
                              backgroundColor: ref.tag === t ? '#1a1612' : '#fff',
                              color: ref.tag === t ? '#f5f1ea' : '#1a1612',
                              cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent'
                            }}>{t}</button>
                        ))}
                      </div>
                      <input type="text" value={ref.note || ''}
                        onChange={(e) => updateReference(ref.id, { note: e.target.value })}
                        placeholder="Заметка"
                        style={{width: '100%', border: '1px solid #1a1612', padding: '8px', fontSize: '13px', fontFamily: 'inherit', backgroundColor: 'transparent'}} />
                    </div>
                  ))}
                </div>
              </div>

              <button type="button" onClick={analyzeReferences} disabled={loading} style={{...btn('primary'), opacity: loading ? 0.5 : 1}}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> Изучаю вкус...</> : <>Проанализировать <Sparkles size={16} /></>}
              </button>
              {error && <p className="mt-4 text-red-700">{error}</p>}
            </>
          )}

          {referenceAnalysis && (
            <div className="mt-10 border-t-2 border-[#1a1612] pt-8">
              <p className="text-xs tracking-[0.4em] uppercase mb-3 text-[#8b7355]">— Визуальный вектор —</p>
              <h3 className="text-2xl md:text-3xl italic mb-4 font-light">Эстетика</h3>
              <p className="text-lg text-[#3d352c] mb-6 italic border-l-2 border-[#1a1612] pl-5">{referenceAnalysis.aestheticSummary}</p>
              <div className="bg-[#1a1612] text-[#f5f1ea] p-5 mb-6">
                <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#d4c8b5]">Формула</p>
                <p className="italic text-lg">{referenceAnalysis.styleFormula}</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#8b7355]">Стили</p>
                  <div className="flex flex-wrap gap-2">
                    {referenceAnalysis.keyStyles.map((s, i) => (
                      <span key={i} style={{padding: '4px 12px', border: '1px solid #1a1612', fontSize: '13px'}}>{s}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#8b7355]">Настроение</p>
                  <p className="italic">{referenceAnalysis.vibeKeywords.join(' · ')}</p>
                </div>
              </div>
              <div className="mb-6">
                <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#8b7355]">Цвета</p>
                <p>{referenceAnalysis.dominantColors.join(', ')}</p>
              </div>
              <div className="mb-6 p-5 border-2 border-[#1a1612]">
                <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#8b7355]">Силуэты</p>
                <p className="italic">{referenceAnalysis.silhouettes}</p>
              </div>
              <div className="mb-6">
                <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#8b7355]">Материалы</p>
                <p>{referenceAnalysis.materials.join(', ')}</p>
              </div>
              <div className="bg-[#3d352c] text-[#f5f1ea] p-5">
                <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#d4c8b5]">✓ Учтено</p>
                <p>Теперь при создании образов я буду учитывать твой вкус.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ LOOKS ============
  if (step === 'looks') {
    return (
      <div className="min-h-screen bg-[#f5f1ea] text-[#1a1612] font-serif">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <Back onClick={() => { setStep('dashboard'); setCurrentLook(null); setSelectedStyle(''); setSelectedOccasion(''); }} />

          {!currentLook && !loading && (
            <>
              <p className="text-xs tracking-[0.4em] uppercase mb-3 text-[#8b7355]">— Ателье —</p>
              <h2 className="text-4xl md:text-5xl mb-2 font-light italic">Создать образ</h2>
              <p className="text-[#3d352c] mb-4">Выбери стиль и повод.</p>

              {referenceAnalysis && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '8px 14px', backgroundColor: '#3d352c', color: '#f5f1ea',
                  fontSize: '12px', marginBottom: '20px'
                }}>
                  <Check size={14} /> Референсы учтены
                </div>
              )}

              <div className="mb-6">
                <label className="text-xs tracking-[0.3em] uppercase mb-3 block text-[#8b7355]">Стиль</label>
                <div className="flex flex-wrap gap-2">
                  {styleOptions.map(s => <Choice key={s} selected={selectedStyle === s} onClick={() => setSelectedStyle(s)}>{s}</Choice>)}
                </div>
              </div>
              <div className="mb-8">
                <label className="text-xs tracking-[0.3em] uppercase mb-3 block text-[#8b7355]">Повод</label>
                <div className="flex flex-wrap gap-2">
                  {occasions.map(o => <Choice key={o} selected={selectedOccasion === o} onClick={() => setSelectedOccasion(o)}>{o}</Choice>)}
                </div>
              </div>

              <button type="button" onClick={() => generateLook(selectedStyle, selectedOccasion)}
                disabled={!selectedStyle || !selectedOccasion}
                style={{...btn('primary'), opacity: (!selectedStyle || !selectedOccasion) ? 0.3 : 1, cursor: (!selectedStyle || !selectedOccasion) ? 'not-allowed' : 'pointer'}}>
                Создать <Sparkles size={16} />
              </button>
              {error && <p className="mt-4 text-red-700">{error}</p>}
            </>
          )}

          {loading && (
            <div className="py-20 text-center">
              <Loader2 size={36} className="animate-spin mx-auto mb-3" strokeWidth={1} />
              <p className="italic">Собираю образ...</p>
            </div>
          )}

          {currentLook && !loading && (
            <div>
              <p className="text-xs tracking-[0.4em] uppercase mb-3 text-[#8b7355]">— Look —</p>
              <h2 className="text-4xl md:text-5xl mb-3 font-light italic">{currentLook.name}</h2>
              <p className="text-lg text-[#3d352c] mb-6">{currentLook.mood}</p>

              {currentLook.palette && (
                <div className="mb-6">
                  <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#8b7355]">Палитра</p>
                  <div className="flex gap-2">
                    {currentLook.palette.map((c, i) => (
                      <div key={i}><div style={{backgroundColor: c, width: '50px', height: '70px', border: '1px solid #1a1612'}} /></div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t-2 border-[#1a1612] pt-5 mb-6">
                <p className="text-xs tracking-[0.3em] uppercase mb-4 text-[#8b7355]">Детали</p>
                <div className="space-y-4">
                  {currentLook.items.map((item, i) => (
                    <div key={i} className="pb-4 border-b border-[#1a1612]/20">
                      <p className="text-xs tracking-[0.3em] uppercase text-[#8b7355] mb-1">{item.category}</p>
                      <p className="text-lg italic">{item.name}</p>
                      <p className="text-sm text-[#3d352c] mb-1">Цвет: {item.color}</p>
                      <p className="text-sm text-[#3d352c]">{item.why}</p>
                    </div>
                  ))}
                </div>
              </div>

              {currentLook.stylingTips && (
                <div className="mb-6 bg-[#1a1612] text-[#f5f1ea] p-5">
                  <p className="text-xs tracking-[0.3em] uppercase mb-3 text-[#d4c8b5]">Советы</p>
                  <ul className="space-y-2">
                    {currentLook.stylingTips.map((t, i) => (
                      <li key={i} className="flex gap-2"><span className="italic text-[#d4c8b5]">{i+1}.</span>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {currentLook.personalNote && (
                <div className="italic border-l-4 border-[#1a1612] pl-5 mb-6 text-[#3d352c]">"{currentLook.personalNote}"</div>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => { setCurrentLook(null); setSelectedStyle(''); setSelectedOccasion(''); }} style={btn('outline')}>Ещё образ</button>
                <button type="button" onClick={() => generateLook(selectedStyle, selectedOccasion)} style={btn('primary')}>Другой вариант</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ WARDROBE ============
  if (step === 'wardrobe') {
    const addItem = () => {
      if (newItem.type && newItem.color) {
        const updated = [...wardrobe, { ...newItem, id: Date.now() }];
        setWardrobe(updated); save('stylist:wardrobe', updated);
        setNewItem({ type: '', color: '', description: '', photo: null, photoData: null, photoMediaType: null });
      }
    };
    const removeItem = (id) => {
      const updated = wardrobe.filter(w => w.id !== id);
      setWardrobe(updated); save('stylist:wardrobe', updated);
    };
    return (
      <div className="min-h-screen bg-[#f5f1ea] text-[#1a1612] font-serif">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <Back onClick={() => { setStep('dashboard'); setWardrobeAnalysis(null); }} />
          <p className="text-xs tracking-[0.4em] uppercase mb-3 text-[#8b7355]">— Инвентаризация —</p>
          <h2 className="text-4xl md:text-5xl mb-2 font-light italic">Гардероб</h2>
          <p className="text-[#3d352c] mb-8">Добавь вещи — можно загрузить фото и я сама заполню детали.</p>

          <input ref={itemPhotoRef} type="file" accept="image/*" onChange={analyzeItemPhoto} style={{display: 'none'}} />

          <div className="mb-6 p-5" style={{border: '2px solid #1a1612', backgroundColor: '#fff'}}>
            {/* Превью фото если есть */}
            {newItem.photo && (
              <div style={{marginBottom: '16px', display: 'flex', gap: '16px', alignItems: 'flex-start'}}>
                <img src={newItem.photo} alt="item" style={{width: '120px', height: '160px', objectFit: 'cover', border: '1px solid #1a1612'}} />
                <div style={{flex: 1}}>
                  <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#8b7355]">✓ Проанализировано</p>
                  <p className="text-sm text-[#3d352c] mb-3">Я распознала вещь — проверь данные ниже и исправь, если что-то не так.</p>
                  <button type="button" onClick={() => setNewItem({ type: '', color: '', description: '', photo: null, photoData: null, photoMediaType: null })}
                    style={{background: 'none', border: '1px solid #1a1612', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit'}}>
                    Убрать фото
                  </button>
                </div>
              </div>
            )}

            {/* Кнопка загрузки фото */}
            {!newItem.photo && (
              <div style={{marginBottom: '16px'}}>
                <button type="button" onClick={() => itemPhotoRef.current?.click()} disabled={analyzingItem}
                  style={{
                    ...btn('outline'),
                    opacity: analyzingItem ? 0.5 : 1,
                    cursor: analyzingItem ? 'wait' : 'pointer'
                  }}>
                  {analyzingItem ? <><Loader2 size={14} className="animate-spin" /> Изучаю вещь...</> : <><ImageIcon size={14} /> Загрузить фото вещи</>}
                </button>
                <p className="text-xs text-[#8b7355] mt-2 italic">...или заполни вручную ↓</p>
              </div>
            )}

            <p className="text-xs tracking-[0.3em] uppercase mb-3 text-[#8b7355]">Тип</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {itemCategories.map(c => <Choice key={c} selected={newItem.type === c} onClick={() => setNewItem({...newItem, type: c})}>{c}</Choice>)}
            </div>
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <input type="text" value={newItem.color} onChange={(e) => setNewItem({...newItem, color: e.target.value})}
                placeholder="Цвет" className="border-2 border-[#1a1612] bg-transparent p-3 text-sm focus:outline-none" />
              <input type="text" value={newItem.description} onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                placeholder="Описание" className="border-2 border-[#1a1612] bg-transparent p-3 text-sm focus:outline-none" />
            </div>
            <button type="button" onClick={addItem} style={btn('primary')}><Plus size={14} /> Добавить в гардероб</button>
            {error && !analyzingItem && <p className="mt-3 text-red-700 text-sm">{error}</p>}
          </div>

          {wardrobe.length > 0 && (
            <>
              <div className="mb-6">
                <p className="text-xs tracking-[0.3em] uppercase mb-3 text-[#8b7355]">В гардеробе ({wardrobe.length})</p>
                <div className="space-y-2">
                  {wardrobe.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 border-b border-[#1a1612]/20 py-3">
                      {item.photo ? (
                        <img src={item.photo} alt={item.type} style={{width: '60px', height: '80px', objectFit: 'cover', border: '1px solid #1a1612', flexShrink: 0}} />
                      ) : (
                        <div style={{width: '60px', height: '80px', border: '1px solid #1a1612', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.3}}>
                          <Shirt size={20} />
                        </div>
                      )}
                      <div style={{flex: 1, minWidth: 0}}>
                        <p className="italic text-lg">{item.type}</p>
                        <p className="text-sm">{item.color}</p>
                        {item.description && <p className="text-xs text-[#3d352c] truncate">{item.description}</p>}
                      </div>
                      <button type="button" onClick={() => removeItem(item.id)}
                        style={{background: 'none', border: 'none', cursor: 'pointer', color: '#8b7355', padding: '4px', flexShrink: 0, WebkitTapHighlightColor: 'transparent'}}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button type="button" onClick={analyzeWardrobe} disabled={loading || wardrobe.length < 3}
                style={{...btn('primary'), opacity: (loading || wardrobe.length < 3) ? 0.3 : 1, cursor: (loading || wardrobe.length < 3) ? 'not-allowed' : 'pointer'}}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> Анализ...</> : <>Проанализировать <Sparkles size={16} /></>}
              </button>
              {error && <p className="mt-4 text-red-700">{error}</p>}
            </>
          )}

          {wardrobeAnalysis && (
            <div className="mt-10 border-t-2 border-[#1a1612] pt-8">
              <p className="text-xs tracking-[0.4em] uppercase mb-3 text-[#8b7355]">— Анализ —</p>
              <p className="text-lg text-[#3d352c] mb-6 italic border-l-2 border-[#1a1612] pl-5">{wardrobeAnalysis.summary}</p>
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-xs tracking-[0.3em] uppercase mb-3 text-[#8b7355]">Сильные стороны</p>
                  <ul className="space-y-2">
                    {wardrobeAnalysis.strengths.map((s, i) => <li key={i}>+ {s}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-xs tracking-[0.3em] uppercase mb-3 text-[#8b7355]">Чего не хватает</p>
                  <ul className="space-y-2">
                    {wardrobeAnalysis.gaps.map((g, i) => <li key={i}>— {g}</li>)}
                  </ul>
                </div>
              </div>
              <div className="mb-6 p-5 border-2 border-[#1a1612]">
                <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#8b7355]">Цвета</p>
                <p className="italic">{wardrobeAnalysis.colorHarmony}</p>
              </div>
              <div className="mb-6">
                <p className="text-xs tracking-[0.3em] uppercase mb-3 text-[#8b7355]">Докупить</p>
                <div className="space-y-3">
                  {wardrobeAnalysis.recommendations.map((r, i) => (
                    <div key={i} className="border-b border-[#1a1612]/20 pb-3">
                      <p className="italic">{r.item}</p>
                      <p className="text-sm text-[#3d352c]">{r.why}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[#1a1612] text-[#f5f1ea] p-5">
                <p className="text-xs tracking-[0.3em] uppercase mb-2 text-[#d4c8b5]">Капсула</p>
                <p className="italic">{wardrobeAnalysis.capsuleAdvice}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ OUTFITS ============
  if (step === 'outfits') {
    return (
      <div className="min-h-screen bg-[#f5f1ea] text-[#1a1612] font-serif">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <Back onClick={() => { setStep('dashboard'); setCurrentOutfit(null); setSelectedOccasion(''); }} />

          {!currentOutfit && !loading && (
            <>
              <p className="text-xs tracking-[0.4em] uppercase mb-3 text-[#8b7355]">— Шоппинг-лук —</p>
              <h2 className="text-4xl md:text-5xl mb-2 font-light italic">Лук с докупкой</h2>
              <p className="text-[#3d352c] mb-8">
                {wardrobe.length < 3 ? `Нужно хотя бы 3 вещи (сейчас: ${wardrobe.length})` : `Использую твои ${wardrobe.length} вещей как основу и подскажу, что ещё стоит докупить для законченного образа.`}
              </p>

              {wardrobe.length < 3 && (
                <button type="button" onClick={() => setStep('wardrobe')} style={btn('outline')}>К гардеробу</button>
              )}

              {wardrobe.length >= 3 && (
                <>
                  <div className="mb-8">
                    <label className="text-xs tracking-[0.3em] uppercase mb-3 block text-[#8b7355]">Повод</label>
                    <div className="flex flex-wrap gap-2">
                      {occasions.map(o => <Choice key={o} selected={selectedOccasion === o} onClick={() => setSelectedOccasion(o)}>{o}</Choice>)}
                    </div>
                  </div>
                  <button type="button" onClick={() => createOutfitFromWardrobe(selectedOccasion)} disabled={!selectedOccasion}
                    style={{...btn('primary'), opacity: !selectedOccasion ? 0.3 : 1, cursor: !selectedOccasion ? 'not-allowed' : 'pointer'}}>
                    Составить <Wand2 size={16} />
                  </button>
                  {error && <p className="mt-4 text-red-700">{error}</p>}
                </>
              )}
            </>
          )}

          {loading && (
            <div className="py-20 text-center">
              <Loader2 size={36} className="animate-spin mx-auto mb-3" strokeWidth={1} />
              <p className="italic">Комбинирую...</p>
            </div>
          )}

          {currentOutfit && !loading && (
            <div>
              <p className="text-xs tracking-[0.4em] uppercase mb-3 text-[#8b7355]">— Твой лук —</p>
              <h2 className="text-4xl md:text-5xl mb-4 font-light italic">{currentOutfit.outfitName}</h2>
              
              {/* Вещи из гардероба */}
              {currentOutfit.ownedItems && currentOutfit.ownedItems.length > 0 && (
                <div className="border-t-2 border-[#1a1612] pt-5 mb-6">
                  <p className="text-xs tracking-[0.3em] uppercase mb-3 text-[#8b7355]">✓ Из твоего гардероба</p>
                  <div className="space-y-3">
                    {currentOutfit.ownedItems.map((s, i) => {
                      const item = wardrobe[s.index - 1];
                      if (!item) return null;
                      return (
                        <div key={i} className="flex items-center gap-3 border-b border-[#1a1612]/20 pb-3">
                          {item.photo && (
                            <img src={item.photo} alt={item.type} style={{width: '70px', height: '90px', objectFit: 'cover', border: '1px solid #1a1612', flexShrink: 0}} />
                          )}
                          <div>
                            <p className="italic text-lg">{item.type} ({item.color})</p>
                            <p className="text-xs tracking-[0.3em] uppercase text-[#8b7355] mt-1">{s.role}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Вещи для покупки */}
              {currentOutfit.itemsToBuy && currentOutfit.itemsToBuy.length > 0 && (
                <div className="mb-6" style={{border: '2px dashed #1a1612', padding: '20px', backgroundColor: '#faf6ed'}}>
                  <p className="text-xs tracking-[0.3em] uppercase mb-4 text-[#8b7355]">+ Стоит докупить ({currentOutfit.itemsToBuy.length})</p>
                  <div className="space-y-4">
                    {currentOutfit.itemsToBuy.map((buy, i) => (
                      <div key={i} className="pb-4" style={{borderBottom: i < currentOutfit.itemsToBuy.length - 1 ? '1px solid rgba(26,22,18,0.2)' : 'none'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '6px'}}>
                          <div>
                            <p className="text-xs tracking-[0.3em] uppercase text-[#8b7355] mb-1">{buy.category}</p>
                            <p className="text-lg italic">{buy.item}</p>
                          </div>
                          {buy.priceRange && (
                            <span style={{fontSize: '11px', padding: '4px 10px', border: '1px solid #1a1612', whiteSpace: 'nowrap', flexShrink: 0}}>
                              {buy.priceRange}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[#3d352c] mb-1"><span className="text-[#8b7355]">Цвет:</span> {buy.color}</p>
                        {buy.details && <p className="text-sm text-[#3d352c] mb-2"><span className="text-[#8b7355]">Детали:</span> {buy.details}</p>}
                        <p className="text-sm italic text-[#3d352c]">↳ {buy.why}</p>
                      </div>
                    ))}
                  </div>
                  {currentOutfit.shoppingTip && (
                    <div style={{marginTop: '16px', padding: '12px', backgroundColor: '#1a1612', color: '#f5f1ea'}}>
                      <p className="text-xs tracking-[0.3em] uppercase mb-1 text-[#d4c8b5]">Совет по шопингу</p>
                      <p className="text-sm italic">{currentOutfit.shoppingTip}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Если ничего не нужно докупать */}
              {currentOutfit.itemsToBuy && currentOutfit.itemsToBuy.length === 0 && (
                <div className="mb-6 p-4" style={{backgroundColor: '#3d352c', color: '#f5f1ea'}}>
                  <p className="italic">✓ Отличные новости — всё необходимое у тебя уже есть!</p>
                </div>
              )}

              <div className="italic border-l-4 border-[#1a1612] pl-5 mb-5 text-[#3d352c]">{currentOutfit.whyItWorks}</div>
              
              <div className="bg-[#1a1612] text-[#f5f1ea] p-5 mb-5">
                <p className="text-xs tracking-[0.3em] uppercase mb-3 text-[#d4c8b5]">Как носить</p>
                <ul className="space-y-2">
                  {currentOutfit.stylingDetails.map((d, i) => <li key={i} className="flex gap-2"><span className="italic text-[#d4c8b5]">{i+1}.</span>{d}</li>)}
                </ul>
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => { setCurrentOutfit(null); setSelectedOccasion(''); }} style={btn('outline')}>Ещё лук</button>
                <button type="button" onClick={() => createOutfitFromWardrobe(selectedOccasion)} style={btn('primary')}>Другой вариант</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
