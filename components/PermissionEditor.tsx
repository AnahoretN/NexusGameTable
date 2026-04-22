import React, { useCallback } from 'react';
import { User, Users, X as XIcon } from 'lucide-react';
import { Player, AppLanguage } from '../types';
import { t as translate, Locale } from '../utils/translations';

export type PermissionType = 'visible' | 'manageable' | 'editable';

export interface PermissionConfig {
  type: PermissionType;
  title: string;
  description?: string;
  ids: string[];
  colorClass: 'purple' | 'blue' | 'green';
}

export interface PermissionEditorProps {
  permissions: PermissionConfig[];
  players: Player[];
  onAddPermission: (type: PermissionType, playerId: string) => void;
  onRemovePermission: (type: PermissionType, playerId: string) => void;
  language?: AppLanguage;
  showEmptyState?: boolean;
  stopPropagation?: boolean;
}

const PLAYER_COLORS = {
  purple: {
    bg: 'bg-purple-900 bg-opacity-40',
    border: 'border-purple-700',
    icon: 'text-purple-400'
  },
  blue: {
    bg: 'bg-blue-900 bg-opacity-40',
    border: 'border-blue-700',
    icon: 'text-blue-400'
  },
  green: {
    bg: 'bg-green-900 bg-opacity-40',
    border: 'border-green-700',
    icon: 'text-green-400'
  }
};

const DEFAULT_TITLES: Record<PermissionType, string> = {
  visible: 'Who Can View',
  manageable: 'Who Can Manage',
  editable: 'Who Can Edit'
};

const DEFAULT_DESCRIPTIONS: Record<PermissionType, string> = {
  visible: '',
  manageable: 'Can change values, text, move sliders, but cannot add/remove blocks, columns, or rows',
  editable: 'Full access: can add/remove blocks, columns, rows, and modify everything'
};

const HAND_TITLES: Record<PermissionType, string> = {
  visible: 'Who Can View This Hand',
  manageable: 'Who Can Manage This Hand',
  editable: ''
};

const HAND_DESCRIPTIONS: Record<PermissionType, string> = {
  visible: '',
  manageable: 'Can reorder and manipulate cards in this hand',
  editable: ''
};

const POOL_DESCRIPTIONS: Record<PermissionType, string> = {
  visible: '',
  manageable: 'Can move and manipulate objects in the pool',
  editable: 'Full access: can add/remove objects and modify everything'
};

export type PermissionEditorContext = 'character' | 'hand' | 'pool';

export interface PermissionEditorGroupProps {
  permission: PermissionConfig;
  players: Player[];
  onAdd: (playerId: string) => void;
  onRemove: (playerId: string) => void;
  language?: AppLanguage;
  showEmptyState?: boolean;
  stopPropagation?: boolean;
}

const PermissionGroup: React.FC<PermissionEditorGroupProps> = ({
  permission,
  players,
  onAdd,
  onRemove,
  language = 'en',
  showEmptyState = false,
  stopPropagation = false
}) => {
  const locale = language as Locale;
  const colors = PLAYER_COLORS[permission.colorClass];

  const getPlayerInfo = useCallback((playerId: string) => {
    if (playerId === 'all_players') {
      return { name: translate('All Players', locale), icon: Users };
    }
    const player = players.find(p => p.id === playerId);
    return {
      name: player?.name || translate('Player', locale),
      icon: User
    };
  }, [players, locale]);

  const hasPlayers = permission.ids && permission.ids.length > 0;

  const eventHandlers = stopPropagation ? {
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation()
  } : {};

  return (
    <div className={`p-4 ${permission.description ? 'border-b border-slate-700' : ''}`}>
      <h3 className="text-sm font-medium text-slate-300 mb-2">{permission.title}</h3>
      {permission.description && (
        <p className="text-xs text-slate-500 mb-3">{permission.description}</p>
      )}
      <div className="space-y-2">
        {hasPlayers ? (
          permission.ids.map(playerId => {
            const playerInfo = getPlayerInfo(playerId);
            const Icon = playerInfo.icon;
            return (
              <div
                key={playerId}
                className={`flex items-center justify-between ${colors.bg} px-3 py-2 rounded border ${colors.border}`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={16} className={colors.icon} />
                  <span className="text-sm text-white">{playerInfo.name}</span>
                </div>
                <button
                  onClick={() => onRemove(playerId)}
                  {...eventHandlers}
                  className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                >
                  <XIcon size={16} />
                </button>
              </div>
            );
          })
        ) : showEmptyState && (
          <p className="text-xs text-slate-500 italic">
            {translate(`No players with ${permission.type} access yet`, locale)}
          </p>
        )}

        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              onAdd(e.target.value);
              e.target.value = '';
            }
          }}
          {...eventHandlers}
          className={`w-full bg-slate-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2 ${stopPropagation ? 'cursor-pointer relative z-[1001]' : ''}`}
        >
          <option value="">{translate('Add player...', locale)}</option>
          {!permission.ids?.includes('all_players') && (
            <option value="all_players">{translate('All Players', locale)}</option>
          )}
          {players
            .filter(p => !p.isGM && !permission.ids?.includes(p.id))
            .map(player => (
              <option key={player.id} value={player.id}>{player.name}</option>
            ))}
        </select>
      </div>
    </div>
  );
};

export const PermissionEditor: React.FC<PermissionEditorProps> = ({
  permissions,
  players,
  onAddPermission,
  onRemovePermission,
  language = 'en',
  showEmptyState = false,
  stopPropagation = false
}) => {
  return (
    <>
      {permissions.map(permission => (
        <PermissionGroup
          key={permission.type}
          permission={permission}
          players={players}
          onAdd={(playerId) => onAddPermission(permission.type, playerId)}
          onRemove={(playerId) => onRemovePermission(permission.type, playerId)}
          language={language}
          showEmptyState={showEmptyState}
          stopPropagation={stopPropagation}
        />
      ))}
    </>
  );
};

// Helper functions to create permission configs
export const createPermissions = (
  visibleIds: string[] = [],
  manageableIds: string[] = [],
  editableIds: string[] = [],
  context: PermissionEditorContext = 'character',
  language: AppLanguage = 'en'
): PermissionConfig[] => {
  const locale = language as Locale;
  const titles = context === 'hand' ? HAND_TITLES : DEFAULT_TITLES;
  const descriptions = context === 'hand' ? HAND_DESCRIPTIONS : context === 'pool' ? POOL_DESCRIPTIONS : DEFAULT_DESCRIPTIONS;

  const configs: PermissionConfig[] = [
    {
      type: 'visible',
      title: translate(titles.visible, locale),
      description: descriptions.visible,
      ids: visibleIds,
      colorClass: 'purple'
    }
  ];

  if (manageableIds !== undefined) {
    configs.push({
      type: 'manageable',
      title: translate(titles.manageable, locale),
      description: descriptions.manageable,
      ids: manageableIds,
      colorClass: 'blue'
    });
  }

  if (editableIds !== undefined) {
    configs.push({
      type: 'editable',
      title: translate(titles.editable, locale),
      description: descriptions.editable,
      ids: editableIds,
      colorClass: 'green'
    });
  }

  return configs;
};
