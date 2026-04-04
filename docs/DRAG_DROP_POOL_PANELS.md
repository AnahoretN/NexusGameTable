# 🎯 Drag & Drop в Пул-Панели

## ✅ Реализовано

### 🖱️ **Drag-Over визуализация**

При перетаскивании объектов над пул-панелью:

1. **Обнаружение пул-панели**: 
   - При наведении курсора с объектом над пул-панелью
   - Автоматическое определение какой пул-панели соответствует

2. **Визуализация объекта**:
   - **z-index: 999999** - выше всех панелей и окон
   - **Прозрачность: 0.8** - лёгкая полупрозрачность
   - **Масштаб: 1.1x** - небольшое увеличение
   - **Яркость: +20%** - визуальное выделение
   - **Следование за мышью** - объект двигается за курсором

### 🎯 **Логика работы**

#### 📍 **Детекция пул-панели**
```typescript
// В handleMouseMove:
const poolPanel = (e.target as HTMLElement).closest('[data-pool-panel]');
if (poolPanel) {
  setIsDraggingOverPool(poolPanelId); // Отмечаем активную пул-панель
}
```

#### 🎪 **Показ объекта**
```tsx
{isDraggingOverPool && draggingId && (
  <DraggedObjectOverPool
    objectId={draggingId}
    poolPanelId={isDraggingOverPool}
    objects={state.objects}
    pixelsPerVU={pixelsPerVU}
  />
)}
```

#### 🎯 **Drop в пул-панель**
```typescript
// В handleMouseUp:
if (isDraggingOverPool && e) {
  const poolPanel = (e.target as HTMLElement).closest('[data-pool-panel]');
  if (poolPanel) {
    const panelObj = state.objects[panelId] as PanelObject;
    
    // Рассчитываем позицию в координатах пул-панели
    const poolX = panelObj.poolData.offsetX + relativeVUX;
    const poolY = panelObj.poolData.offsetY + relativeVUY;
    
    // Центрируем объект на курсоре
    const finalX = poolX - (objWidth / 2);
    const finalY = poolY - (objHeight / 2);
    
    // Ограничиваем границами пул-панели
    const constrainedX = Math.max(
      panelObj.poolData.offsetX, 
      Math.min(finalX, panelObj.poolData.offsetX + poolWidth - objWidth)
    );
    
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: draggingId, x: constrainedX, y: constrainedY }
    });
  }
}
```

## 🎨 **Визуальные эффекты**

### 🖼️ **Слои рендеринга**
```
z-index hierarchy:
├── 10000    : Windows (modals)
├── 1000     : Panels (pooled)
├── 999999   : Dragged object over pool ← НОВОЕ!
├── 100000    : Normally dragged objects
└── ...
```

### 🎨 **CSS стили dragged объекта**
```css
.dragged-over-pool {
  position: fixed;
  pointer-events: none;  /* Не блокирует мышь */
  opacity: 0.8;             /* Полупрозрачность */
  transform: scale(1.1);     /* Увеличение */
  filter: brightness(1.2); /* Ярче */
}
```

## 🎮 **Как это работает**

### 📋 **Последовательность действий**

1. **Начало drag**:
   - Пользователь нажимает ЛКМ на объекте
   - `setDraggingId(obj.id)`

2. **Перемещение**:
   - Пользователь двигает объект
   - В `handleMouseMove` проверяется `.closest('[data-pool-panel]')`
   - Если найдено: `setIsDraggingOverPool(panelId)`

3. **Визуализация**:
   - Рендерится `<DraggedObjectOverPool>` с высоким z-index
   - Объект следует за мышью
   - Полупрозрачность показывает что объект "в пути"

4. **Drop**:
   - Пользователь отпускает ЛКМ
   - В `handleMouseUp` проверяется `isDraggingOverPool`
   - Если true - объект перемещается в пул-панель
   - `setIsDraggingOverPool(null)` - очистка состояния

### 🎯 **Особенности**

#### 🎨 **Центрирование**
- Объект центрируется на позиции курсора
- Учитываются размеры объекта (width/height)
- Автоматическое ограничение по границам пул-панели

#### 🚫 **Ограничения**
- Объект не может выйти за пределы пул-панели
- Координаты конвертируются из экранных в VU
- Учитывается `offsetX/offsetY` пул-панели

#### 🔄 **Состояние**
```typescript
const [isDraggingOverPool, setIsDraggingOverPool] = useState<string | null>(null);
```
- `null` - не над пул-панелью
- `"pool-panel-id"` - ID пул-панели над которой объект

## 📊 **Поддерживаемые типы объектов**

**Все игровые объекты** могут быть перетащены в пул-панели:
- 🃏 Карточки (CARD)
- 🎲 Кости (DICE_OBJECT)
- 🎯 Токены (TOKEN)
- 📊 Колоды (DECK)
- 🎨 Рисунки (DRAWING)
- ⚔️ Поля боя (BATTLEFIELD_CELL)
- 🗺️ Доски (BOARD)
- 🔗 Nexus доски (NEXUS_BOARD)
- 📍 Nexus клетки (NEXUS_CELL)
- 🔢 Счётчики (COUNTER)
- 🎲 Рандомизаторы (RANDOMIZER)

**Исключения:**
- ❌ Панели (PANEL)
- ❌ Окна (WINDOW)

## 🎉 **Результат**

Теперь при перетаскивании объектов над пул-панелью:

1. ✅ **Визуальный feedback** - объект показывается над пул-панелью
2. ✅ **Следование за мышью** - объект движется вместе с курсором
3. ✅ **Интуитивный drop** - отпустите мышь над пул-панелью → объект внутри
4. ✅ **Авто-центрирование** - объект центрируется на позиции курсора
5. ✅ **Ограничения** - объект не выходит за пределы пул-панели

Это создаёт естественный и интуитивный интерфейс для перемещения объектов в пул-панели! 🚀