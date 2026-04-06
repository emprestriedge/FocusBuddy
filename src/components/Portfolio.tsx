import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Heart, Search, Star, Trash2 } from 'lucide-react';
import { Task } from '../types';
import { COLORS, Icons } from '../constants';
import { storageService } from '../services/storageService';

interface PortfolioProps {
  tasks: Task[];
  onTasksUpdated?: (tasks: Task[]) => void;
}

interface ContextMenuPosition {
  x: number;
  y: number;
  taskId: string;
}

const PortfolioItem = React.memo(
  ({
    task,
    onFavoriteToggle,
    onDelete,
    onCardClick,
    onContextMenu,
  }: {
    task: Task;
    onFavoriteToggle: (taskId: string) => void;
    onDelete: (taskId: string) => void;
    onCardClick: (task: Task) => void;
    onContextMenu: (e: React.MouseEvent, taskId: string) => void;
  }) => {
    const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);

    const handleMouseDown = () => {
      const timer = setTimeout(() => {
        onContextMenu(new MouseEvent('contextmenu') as any, task.id);
      }, 600);
      setPressTimer(timer);
    };

    const handleMouseUp = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        setPressTimer(null);
      }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu(e, task.id);
    };

    const formattedDate = task.completedAt
      ? new Date(task.completedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    return (
      <div
        className="glass-card group relative overflow-hidden rounded-lg cursor-pointer transition-all duration-300 hover:shadow-lg"
        style={{
          backgroundColor: `${COLORS.coffee}15`,
          borderColor: COLORS.green,
        }}
        onClick={() => onCardClick(task)}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      >
        {/* Photo container */}
        {task.photoUrl && (
          <div className="relative w-full h-40 overflow-hidden bg-gradient-to-b from-transparent to-black/20">
            <img
              src={task.photoUrl}
              alt={task.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </div>
        )}

        {/* Content */}
        <div className="p-4">
          {/* Header with star badge */}
          <div className="flex items-start justify-between mb-2 gap-2">
            <div className="flex-1">
              <h3
                className="font-semibold text-lg line-clamp-2 transition-colors duration-200"
                style={{ color: COLORS.cream }}
              >
                {task.name}
              </h3>
              <p
                className="text-sm mt-1"
                style={{ color: COLORS.caramel }}
              >
                {formattedDate}
              </p>
            </div>
            <div
              className="rounded-full p-2 flex-shrink-0"
              style={{ backgroundColor: `${COLORS.green}20` }}
            >
              <Star
                size={16}
                style={{ color: COLORS.green }}
                fill={COLORS.green}
              />
            </div>
          </div>

          {/* Reflection text */}
          {task.reflection && (
            <p
              className="text-sm line-clamp-4 mb-4"
              style={{ color: COLORS.caramel }}
            >
              {task.reflection}
            </p>
          )}

          {/* Favorite button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavoriteToggle(task.id);
            }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm transition-colors duration-200"
            style={{
              backgroundColor: task.isFavorite
                ? `${COLORS.green}30`
                : `${COLORS.coffee}40`,
              color: task.isFavorite ? COLORS.green : COLORS.caramel,
            }}
            title={task.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart
              size={14}
              fill={task.isFavorite ? COLORS.green : 'none'}
            />
            <span>{task.isFavorite ? 'Favorited' : 'Favorite'}</span>
          </button>
        </div>
      </div>
    );
  }
);

PortfolioItem.displayName = 'PortfolioItem';

export const Portfolio: React.FC<PortfolioProps> = ({
  tasks,
  onTasksUpdated,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(12);
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(
    null
  );
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Filter tasks for portfolio display
  const galleryTasks = useMemo(() => {
    return tasks.filter(
      (task) => task.completed === true && task.showInGallery === true
    );
  }, [tasks]);

  // Search and filter
  const filteredTasks = useMemo(() => {
    let result = galleryTasks;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (task) =>
          task.name.toLowerCase().includes(query) ||
          (task.reflection && task.reflection.toLowerCase().includes(query))
      );
    }

    if (showFavoritesOnly) {
      result = result.filter((task) => task.isFavorite === true);
    }

    return result;
  }, [galleryTasks, searchQuery, showFavoritesOnly]);

  // Get tasks to display
  const displayedTasks = useMemo(() => {
    return filteredTasks.slice(0, displayedCount);
  }, [filteredTasks, displayedCount]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayedCount < filteredTasks.length) {
          setDisplayedCount((prev) => Math.min(prev + 12, filteredTasks.length));
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [filteredTasks.length, displayedCount]);

  // Handle favorite toggle
  const handleFavoriteToggle = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const updatedTask = { ...task, isFavorite: !task.isFavorite };
      await storageService.updateTask(updatedTask);

      const updatedTasks = tasks.map((t) =>
        t.id === taskId ? updatedTask : t
      );
      onTasksUpdated?.(updatedTasks);
    },
    [tasks, onTasksUpdated]
  );

  // Handle delete
  const handleDelete = useCallback(
    async (taskId: string) => {
      await storageService.deleteTask(taskId);
      const updatedTasks = tasks.filter((t) => t.id !== taskId);
      onTasksUpdated?.(updatedTasks);
      setContextMenu(null);
    },
    [tasks, onTasksUpdated]
  );

  // Handle context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, taskId: string) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        taskId,
      });
    },
    []
  );

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
    };

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, []);

  // Handle card click for modal
  const handleCardClick = useCallback((task: Task) => {
    setSelectedTask(task);
  }, []);

  const hasResults = displayedTasks.length > 0;
  const hasMoreToLoad = filteredTasks.length > displayedCount;

  return (
    <div className="w-full min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur-sm bg-gradient-to-b from-black/40 to-transparent">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1
            className="text-3xl sm:text-4xl font-bold mb-6"
            style={{ color: COLORS.cream }}
          >
            Portfolio
          </h1>

          {/* Search bar */}
          <div className="relative mb-4">
            <Search
              size={20}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: COLORS.caramel }}
            />
            <input
              type="text"
              placeholder="Search completed tasks..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setDisplayedCount(12);
              }}
              className="glass-tile-tinted w-full pl-10 pr-4 py-3 rounded-lg border border-opacity-20 outline-none transition-all duration-200 placeholder-opacity-50"
              style={{
                backgroundColor: `${COLORS.coffee}20`,
                borderColor: COLORS.green,
                color: COLORS.cream,
              }}
            />
          </div>

          {/* Filter toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setShowFavoritesOnly(!showFavoritesOnly);
                setDisplayedCount(12);
              }}
              className="px-4 py-2 rounded-lg font-medium transition-all duration-200"
              style={{
                backgroundColor: showFavoritesOnly
                  ? `${COLORS.green}30`
                  : `${COLORS.coffee}40`,
                color: showFavoritesOnly ? COLORS.green : COLORS.caramel,
                borderColor: showFavoritesOnly ? COLORS.green : 'transparent',
                border: '1px solid',
              }}
            >
              <Heart
                size={16}
                className="inline mr-2"
                fill={showFavoritesOnly ? COLORS.green : 'none'}
              />
              Favorites
            </button>
            <button
              onClick={() => {
                setShowFavoritesOnly(false);
                setDisplayedCount(12);
                setSearchQuery('');
              }}
              className="px-4 py-2 rounded-lg font-medium transition-all duration-200"
              style={{
                backgroundColor: !showFavoritesOnly && searchQuery === ''
                  ? `${COLORS.green}30`
                  : `${COLORS.coffee}40`,
                color:
                  !showFavoritesOnly && searchQuery === ''
                    ? COLORS.green
                    : COLORS.caramel,
              }}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Gallery grid */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {!hasResults ? (
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center">
              <p
                className="text-xl italic"
                style={{ color: COLORS.caramel }}
              >
                The collection is quiet.
              </p>
              <p
                className="text-sm mt-2"
                style={{ color: `${COLORS.caramel}80` }}
              >
                {searchQuery
                  ? 'No tasks match your search.'
                  : showFavoritesOnly
                  ? 'No favorites yet.'
                  : 'Complete tasks and add them to the gallery to get started.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedTasks.map((task) => (
                <PortfolioItem
                  key={task.id}
                  task={task}
                  onFavoriteToggle={handleFavoriteToggle}
                  onDelete={handleDelete}
                  onCardClick={handleCardClick}
                  onContextMenu={handleContextMenu}
                />
              ))}
            </div>

            {/* Infinite scroll trigger */}
            {hasMoreToLoad && (
              <div
                ref={observerTarget}
                className="mt-12 flex justify-center"
              >
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: COLORS.green }}
                />
              </div>
            )}

            {/* Load complete indicator */}
            {!hasMoreToLoad && displayedTasks.length > 0 && (
              <div className="mt-12 text-center">
                <p
                  className="text-sm italic"
                  style={{ color: COLORS.caramel }}
                >
                  {displayedTasks.length} task{displayedTasks.length !== 1 ? 's' : ''} shown
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="glass-tile-tinted fixed rounded-lg shadow-2xl z-50 overflow-hidden border"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            backgroundColor: `${COLORS.coffee}95`,
            borderColor: COLORS.green,
            minWidth: '160px',
          }}
        >
          <button
            onClick={() => {
              handleDelete(contextMenu.taskId);
            }}
            className="w-full px-4 py-3 flex items-center gap-2 hover:bg-opacity-70 transition-colors duration-150 text-sm font-medium"
            style={{
              backgroundColor: `${COLORS.coffee}40`,
              color: '#DC2626',
            }}
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selectedTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="glass-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            style={{
              backgroundColor: `${COLORS.coffee}95`,
              borderColor: COLORS.green,
              border: `1px solid ${COLORS.green}40`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="sticky top-0 flex items-center justify-between p-6 border-b" style={{ borderColor: `${COLORS.green}20` }}>
              <h2
                className="text-2xl font-bold"
                style={{ color: COLORS.cream }}
              >
                {selectedTask.name}
              </h2>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-2xl leading-none transition-colors duration-200"
                style={{ color: COLORS.caramel }}
              >
                ×
              </button>
            </div>

            {/* Modal content */}
            <div className="p-6">
              {/* Photo */}
              {selectedTask.photoUrl && (
                <img
                  src={selectedTask.photoUrl}
                  alt={selectedTask.name}
                  className="w-full h-auto rounded-lg mb-6 object-cover max-h-96"
                />
              )}

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p
                    className="text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: COLORS.caramel }}
                  >
                    Completed
                  </p>
                  <p
                    className="text-lg"
                    style={{ color: COLORS.cream }}
                  >
                    {selectedTask.completedAt
                      ? new Date(selectedTask.completedAt).toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'No date'}
                  </p>
                </div>
                <div>
                  <p
                    className="text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: COLORS.caramel }}
                  >
                    Status
                  </p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: COLORS.green }}
                    />
                    <p
                      className="text-lg"
                      style={{ color: COLORS.cream }}
                    >
                      Completed
                    </p>
                  </div>
                </div>
              </div>

              {/* Reflection */}
              {selectedTask.reflection && (
                <div className="mb-6">
                  <p
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: COLORS.caramel }}
                  >
                    Reflection
                  </p>
                  <p
                    className="leading-relaxed"
                    style={{ color: COLORS.cream }}
                  >
                    {selectedTask.reflection}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-4 border-t" style={{ borderColor: `${COLORS.green}20` }}>
                <button
                  onClick={() => {
                    handleFavoriteToggle(selectedTask.id);
                  }}
                  className="flex-1 px-4 py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: selectedTask.isFavorite
                      ? `${COLORS.green}30`
                      : `${COLORS.coffee}40`,
                    color: selectedTask.isFavorite
                      ? COLORS.green
                      : COLORS.caramel,
                  }}
                >
                  <Heart
                    size={18}
                    fill={selectedTask.isFavorite ? COLORS.green : 'none'}
                  />
                  {selectedTask.isFavorite ? 'Favorited' : 'Favorite'}
                </button>
                <button
                  onClick={() => {
                    handleDelete(selectedTask.id);
                    setSelectedTask(null);
                  }}
                  className="flex-1 px-4 py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: '#7F1D1D20',
                    color: '#DC2626',
                  }}
                >
                  <Trash2 size={18} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Portfolio;
