import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  Eye,
  HardHat,
  Server,
  ShieldAlert,
  UserCog,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

type TimeRange = '1D' | '7D' | '1M' | '6M' | '1Y' | 'Custom';

interface ChartPoint {
  time: string;
  events: number;
  violations: number;
}

interface RecentEvent {
  id: number;
  event_time: string;
  event_type: string;
  confidence_score: number | null;
  camera_name?: string;
  site_name?: string;
  employee_name?: string;
  employee_id?: number | null;
}

interface ViolationRecord {
  id: number;
  violation_time: string;
  violation_type: string;
  status: string;
  camera_name?: string;
  site_name?: string;
  employee_name?: string;
}

interface AdminUserPreview {
  id: number;
  name: string;
  email: string;
  status: string;
  role_name?: 'admin' | 'user';
  site_id?: number | null;
  last_login?: string | null;
}

interface ActivityFeedItem {
  id: string;
  title: string;
  detail: string;
  kind: 'healthy' | 'warning' | 'danger';
}

const getRoleLabel = (roleName?: 'admin' | 'user') => {
  return roleName === 'admin' ? 'Admin' : 'Account';
};

interface CountsState {
  sites: number;
  users: number;
  cameras: number;
  cameras_online: number;
  cameras_offline: number;
  edge_servers: number;
  edge_servers_online: number;
  edge_servers_offline: number;
  employees: number;
  total_events: number;
  frs_detections: number;
  unknown_faces: number;
  ppe_detections: number;
  ppe_violations: number;
}

const TIME_RANGES: { label: string; key: TimeRange }[] = [
  { label: '1D', key: '1D' },
  { label: '7D', key: '7D' },
  { label: '1M', key: '1M' },
  { label: '6M', key: '6M' },
  { label: '1Y', key: '1Y' },
  { label: 'Custom', key: 'Custom' },
];

const emptyCounts: CountsState = {
  sites: 0,
  users: 0,
  cameras: 0,
  cameras_online: 0,
  cameras_offline: 0,
  edge_servers: 0,
  edge_servers_online: 0,
  edge_servers_offline: 0,
  employees: 0,
  total_events: 0,
  frs_detections: 0,
  unknown_faces: 0,
  ppe_detections: 0,
  ppe_violations: 0,
};

const toStartOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const toEndOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
const formatDateLabel = (value: Date) => value.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

const getDateRange = (range: TimeRange, customStart?: string, customEnd?: string) => {
  const now = new Date();
  let start = toStartOfDay(now);
  let end = toEndOfDay(now);

  if (range === '1D') {
    return { start, end };
  }

  if (range === '7D') {
    const date = new Date(now);
    date.setDate(date.getDate() - 6);
    start = toStartOfDay(date);
    return { start, end };
  }

  if (range === '1M') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end };
  }

  if (range === '6M') {
    const date = new Date(now.getFullYear(), now.getMonth(), 1);
    date.setMonth(date.getMonth() - 5);
    start = date;
    return { start, end };
  }

  if (range === '1Y') {
    start = new Date(now.getFullYear(), 0, 1);
    return { start, end };
  }

  const startValue = customStart ? new Date(customStart) : now;
  const endValue = customEnd ? new Date(customEnd) : now;
  const cappedStart = startValue > now ? now : startValue;
  const cappedEnd = endValue > now ? now : endValue;
  const normalizedStart = toStartOfDay(cappedStart);
  const normalizedEnd = toEndOfDay(cappedEnd);

  if (normalizedEnd < normalizedStart) {
    return { start: normalizedEnd, end: normalizedStart };
  }
  return { start: normalizedStart, end: normalizedEnd };
};

const getTimeKey = (timestamp: string, range: TimeRange) => {
  const date = new Date(timestamp);
  if (range === '1D') return `${String(date.getHours()).padStart(2, '0')}:00`;
  if (range === '7D') return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  if (range === '1M') return String(date.getDate());
  if (range === 'Custom') return formatDateLabel(date);
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()];
};

const buildEmptyBuckets = (range: TimeRange, start: Date, end: Date): ChartPoint[] => {
  const now = new Date();

  if (range === '1D') {
    return Array.from({ length: 24 }, (_, index) => ({
      time: `${String(index).padStart(2, '0')}:00`,
      events: 0,
      violations: 0,
    }));
  }

  if (range === '7D') {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(date.getDate() - 6 + index);
      return {
        time: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        events: 0,
        violations: 0,
      };
    });
  }

  if (range === '1M') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => ({
      time: String(index + 1),
      events: 0,
      violations: 0,
    }));
  }

  if (range === 'Custom') {
    const buckets: ChartPoint[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      buckets.push({
        time: formatDateLabel(cursor),
        events: 0,
        violations: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return buckets;
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (range === '6M') {
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now);
      date.setMonth(date.getMonth() - 5 + index);
      return { time: months[date.getMonth()], events: 0, violations: 0 };
    });
  }

  return months.map(month => ({ time: month, events: 0, violations: 0 }));
};

const NavCard = ({
  title,
  value,
  icon: Icon,
  color,
  loading,
  to,
  badge,
}: {
  title: string;
  value: number;
  icon: any;
  color: string;
  loading: boolean;
  to: string;
  badge?: { label: string; type: 'success' | 'danger' | 'warn' };
}) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(to)}
      role="button"
      tabIndex={0}
      onKeyDown={event => event.key === 'Enter' && navigate(to)}
      className="metric-shell group rounded-2xl p-5 flex items-start gap-4 transition-all cursor-pointer relative overflow-hidden"
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-br from-sky-400/8 to-transparent" />
      <div className={`p-3 rounded-lg ${color} flex-shrink-0`}><Icon size={22} className="text-white" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
        {loading ? (
          <div className="h-8 w-16 bg-slate-700/60 animate-pulse rounded" />
        ) : (
          <>
            <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
            {badge && (
              <div className={`flex items-center gap-1 mt-1 ${badge.type === 'success' ? 'text-green-600' : badge.type === 'danger' ? 'text-red-500' : 'text-amber-500'}`}>
                <span className={`w-2 h-2 rounded-full ${badge.type === 'success' ? 'bg-green-500 animate-pulse' : badge.type === 'danger' ? 'bg-red-500' : 'bg-amber-400'}`} />
                <span className="text-xs font-medium">{badge.label}</span>
              </div>
            )}
          </>
        )}
      </div>
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all translate-x-1 group-hover:translate-x-0">
        <div className="flex items-center gap-0.5 text-xs text-blue-500 font-medium">
          View <ArrowRight size={11} />
        </div>
      </div>
    </div>
  );
};

const getEventCategory = (value: string | null | undefined) => {
  const normalized = (value ?? '').toString().trim().toUpperCase();
  if (!normalized) return 'OTHER';
  if (normalized.includes('FRS') || normalized.includes('FACE')) return 'FRS';
  if (
    normalized.includes('PPE')
    || normalized.includes('HELMET')
    || normalized.includes('VEST')
    || normalized.includes('GLOVE')
    || normalized.includes('GOGGLES')
  ) {
    return 'PPE';
  }
  return 'OTHER';
};

const DashboardOverview = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState<TimeRange>('1D');
  const [customStart, setCustomStart] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return date.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [modelFilter, setModelFilter] = useState<'All' | 'FRS' | 'PPE'>('All');
  const [showDropdown, setShowDropdown] = useState(false);
  const [counts, setCounts] = useState<CountsState>(emptyCounts);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [recentViolations, setRecentViolations] = useState<ViolationRecord[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const todayInputMax = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [searchParams] = useSearchParams();
  const normalizedQuery = useMemo(() => (searchParams.get('q') ?? '').trim().toLowerCase(), [searchParams]);
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === 'admin';
  const assignedSiteId = appUser?.site_id ?? null;

  const dateRange = useMemo(() => getDateRange(timeRange, customStart, customEnd), [timeRange, customStart, customEnd]);
  const startDate = useMemo(() => dateRange.start.toISOString(), [dateRange]);
  const endDate = useMemo(() => dateRange.end.toISOString(), [dateRange]);
  const selectedLabel = useMemo(() => {
    if (timeRange !== 'Custom') {
      return TIME_RANGES.find(range => range.key === timeRange)?.label ?? '1D';
    }
    return `${formatDateLabel(dateRange.start)} - ${formatDateLabel(dateRange.end)}`;
  }, [dateRange, timeRange]);
  const visibleRecentEvents = useMemo(() => {
    const base = modelFilter === 'All'
      ? recentEvents
      : recentEvents.filter(event => getEventCategory(event.event_type) === modelFilter);
    if (!normalizedQuery) return base;
    return base.filter(event => {
      const site = event.site_name ?? '';
      const camera = event.camera_name ?? '';
      const employee = event.employee_name ?? 'Unknown';
      const eventType = event.event_type ?? '';
      return [site, camera, employee, eventType].some(value => value.toLowerCase().includes(normalizedQuery));
    });
  }, [recentEvents, modelFilter, normalizedQuery]);

  const visibleRecentViolations = useMemo(() => {
    if (!normalizedQuery) return recentViolations;
    return recentViolations.filter(violation => {
      const site = violation.site_name ?? '';
      const camera = violation.camera_name ?? '';
      const employee = violation.employee_name ?? 'Unknown';
      const violationType = violation.violation_type ?? '';
      return [site, camera, employee, violationType].some(value => value.toLowerCase().includes(normalizedQuery));
    });
  }, [recentViolations, normalizedQuery]);

  const cameraHealthData = useMemo(
    () => [
      { name: 'Online', value: counts.cameras_online, color: '#10b981' },
      { name: 'Offline', value: counts.cameras_offline, color: '#ef4444' },
      { name: 'Unassigned', value: Math.max(counts.cameras - counts.cameras_online - counts.cameras_offline, 0), color: '#f59e0b' },
    ].filter(item => item.value > 0),
    [counts],
  );

  const violationTypeData = useMemo(() => {
    const grouped = new Map<string, number>();
    recentViolations.forEach(item => {
      const key = item.violation_type || 'Unknown';
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    });

    return Array.from(grouped.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [recentViolations]);

  const activityFeed = useMemo<ActivityFeedItem[]>(() => {
    const resolvedViolations = recentViolations.filter(item => item.status === 'resolved').length;
    const openViolations = Math.max(recentViolations.length - resolvedViolations, 0);
    const onlineCameras = counts.cameras_online;
    const offlineCameras = counts.cameras_offline;
    const onlineEdges = counts.edge_servers_online;
    const offlineEdges = counts.edge_servers_offline;

    return [
      {
        id: 'camera-health',
        title: offlineCameras > 0 ? `${offlineCameras} camera${offlineCameras === 1 ? '' : 's'} offline` : 'All cameras healthy',
        detail: offlineCameras > 0 ? `${onlineCameras} online and need attention on offline feeds.` : `${onlineCameras} camera${onlineCameras === 1 ? '' : 's'} currently online.`,
        kind: offlineCameras > 0 ? 'danger' : 'healthy',
      },
      {
        id: 'edge-health',
        title: offlineEdges > 0 ? `${offlineEdges} edge server${offlineEdges === 1 ? '' : 's'} offline` : 'Edge servers healthy',
        detail: offlineEdges > 0 ? `${onlineEdges} edge server${onlineEdges === 1 ? '' : 's'} online, investigate disconnected nodes.` : `${onlineEdges} edge server${onlineEdges === 1 ? '' : 's'} connected and reporting.`,
        kind: offlineEdges > 0 ? 'warning' : 'healthy',
      },
      {
        id: 'violations',
        title: openViolations > 0 ? `${openViolations} open violation${openViolations === 1 ? '' : 's'}` : 'No open violations in recent records',
        detail: `${resolvedViolations} resolved during the selected range.`,
        kind: openViolations > 0 ? 'danger' : 'healthy',
      },
      {
        id: 'recognition',
        title: counts.unknown_faces > 0 ? `${counts.unknown_faces} unknown face detection${counts.unknown_faces === 1 ? '' : 's'}` : 'No unknown face detections',
        detail: `${counts.frs_detections} FRS detection${counts.frs_detections === 1 ? '' : 's'} recorded in total.`,
        kind: counts.unknown_faces > 0 ? 'warning' : 'healthy',
      },
    ];
  }, [counts, recentViolations]);

  const adminUserPreview = useMemo(() => {
    return adminUsers
      .slice()
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'inactive' ? -1 : 1;
        const aLastLogin = a.last_login ? new Date(a.last_login).getTime() : 0;
        const bLastLogin = b.last_login ? new Date(b.last_login).getTime() : 0;
        return bLastLogin - aLastLogin;
      })
      .slice(0, 5);
  }, [adminUsers]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRefreshTick(value => value + 1);
    }, 15000);

    const handleFocus = () => {
      setRefreshTick(value => value + 1);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setChartLoading(false);
      return;
    }

    const fetchStats = async () => {
      setLoading(true);

      try {
        if (!isAdmin && !assignedSiteId) {
          setCounts(emptyCounts);
          return;
        }

        const { data, error } = await supabase.rpc('get_dashboard_summary', {
          p_site_id: isAdmin ? null : assignedSiteId,
          p_start: startDate,
          p_end: endDate,
        });

        if (error) throw error;

        const summary = Array.isArray(data) ? data[0] : data;
        setCounts({
          sites: Number(summary?.sites ?? 0),
          users: Number(summary?.users ?? 0),
          cameras: Number(summary?.cameras ?? 0),
          cameras_online: Number(summary?.cameras_online ?? 0),
          cameras_offline: Number(summary?.cameras_offline ?? 0),
          edge_servers: Number(summary?.edge_servers ?? 0),
          edge_servers_online: Number(summary?.edge_servers_online ?? 0),
          edge_servers_offline: Number(summary?.edge_servers_offline ?? 0),
          employees: Number(summary?.employees ?? 0),
          total_events: Number(summary?.total_events ?? 0),
          frs_detections: Number(summary?.frs_detections ?? 0),
          unknown_faces: Number(summary?.unknown_faces ?? 0),
          ppe_detections: Number(summary?.ppe_detections ?? 0),
          ppe_violations: Number(summary?.ppe_violations ?? 0),
        });
      } catch (error) {
        console.error('Dashboard stats fetch failed:', error);
        setCounts(emptyCounts);
      } finally {
        setLoading(false);
      }
    };

    const fetchCharts = async () => {
      setChartLoading(true);

      try {
        if (!isAdmin && !assignedSiteId) {
          setChartData(buildEmptyBuckets(timeRange, dateRange.start, dateRange.end));
          setRecentEvents([]);
          setRecentViolations([]);
          return;
        }

        const buckets = buildEmptyBuckets(timeRange, dateRange.start, dateRange.end);
        const bucketMap: Record<string, ChartPoint> = {};
        buckets.forEach(bucket => { bucketMap[bucket.time] = { ...bucket }; });

        const [{ data: eventsRaw, error: eventsError }, { data: violationsRaw, error: violationsError }] = await Promise.all([
          supabase.rpc('list_dashboard_events', {
            p_site_id: isAdmin ? null : assignedSiteId,
            p_start: startDate,
            p_end: endDate,
          }),
          supabase.rpc('list_dashboard_violations', {
            p_site_id: isAdmin ? null : assignedSiteId,
            p_start: startDate,
            p_end: endDate,
          }),
        ]);

        if (eventsError) throw eventsError;
        if (violationsError) throw violationsError;

        (eventsRaw ?? []).forEach((event: { event_time: string; event_type?: string | null }) => {
          const key = getTimeKey(event.event_time, timeRange);
          if (!bucketMap[key]) return;
          const category = getEventCategory(event.event_type);
          if (modelFilter !== 'All' && category !== modelFilter) return;
          bucketMap[key].events += 1;
        });

        (violationsRaw ?? []).forEach((violation: { violation_time: string }) => {
          const key = getTimeKey(violation.violation_time, timeRange);
          if (bucketMap[key]) bucketMap[key].violations += 1;
        });

        setChartData(buckets.map(bucket => bucketMap[bucket.time]));
        setRecentEvents((((eventsRaw as unknown) as RecentEvent[]) ?? []).slice(0, 8));
        setRecentViolations((((violationsRaw as unknown) as ViolationRecord[]) ?? []).slice(0, 8));
      } catch (error) {
        console.error('Dashboard chart fetch failed:', error);
        setChartData(buildEmptyBuckets(timeRange, dateRange.start, dateRange.end));
        setRecentEvents([]);
        setRecentViolations([]);
      } finally {
        setChartLoading(false);
      }
    };

    const fetchAdminUsers = async () => {
      if (!isAdmin) {
        setAdminUsers([]);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('list_dashboard_users');
        if (error) throw error;
        setAdminUsers(((data as AdminUserPreview[] | null) ?? []).filter(user => user?.id));
      } catch (error) {
        console.error('Dashboard user preview fetch failed:', error);
        setAdminUsers([]);
      }
    };

    fetchStats();
    fetchCharts();
    fetchAdminUsers();
  }, [assignedSiteId, dateRange, endDate, isAdmin, modelFilter, refreshTick, startDate, timeRange]);

  const handleExport = () => {
    const data = [
      ['Category', 'Count'],
      ['Total Sites', counts.sites],
      ['Total Cameras', counts.cameras],
      ['Cameras Online', counts.cameras_online],
      ['Cameras Offline', counts.cameras_offline],
      ['Edge Servers', counts.edge_servers],
      ['Employees', counts.employees],
      ['Total AI Events', counts.total_events],
      ['PPE Detections', counts.ppe_detections],
      ['PPE Violations', counts.ppe_violations],
      ['Unknown Face Detections', counts.unknown_faces],
    ];

    const csvContent = data.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dashboard_summary_${timeRange.replace(' ', '_').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <Database size={28} className="text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Database Not Connected</h2>
        <p className="text-slate-500 text-sm text-center max-w-md">
          Your <code className="bg-slate-100 px-1 rounded">Praveen/.env</code> must contain a valid <code className="bg-slate-100 px-1 rounded">VITE_SUPABASE_URL</code> and browser-safe <code className="bg-slate-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>.
          Add it and restart <code className="bg-slate-100 px-1 rounded">npm run dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" onClick={() => setShowDropdown(false)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="page-section px-5 py-4 sm:px-6 sm:py-4 flex-1">
          <h1 className="page-title text-xl sm:text-2xl">{isAdmin ? 'System Dashboard' : 'Site Dashboard'}</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap" onClick={event => event.stopPropagation()}>
          <div className="relative">
            <button onClick={() => setShowDropdown(value => !value)} className="panel-control flex items-center gap-2 text-sm font-medium rounded-xl px-3 py-2.5 transition-colors min-w-[150px]">
              <TrendingUp size={14} className="text-slate-400" />
              <span className="flex-1 text-left">{selectedLabel}</span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showDropdown && (
              <div className="absolute right-0 top-full mt-2 panel-control rounded-2xl z-50 min-w-[160px] overflow-hidden">
                {TIME_RANGES.map(range => (
                  <button key={range.key} onClick={() => { setTimeRange(range.key); setShowDropdown(false); }} className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${timeRange === range.key ? 'text-white font-medium bg-sky-600/80' : 'text-slate-200 hover:bg-white/5'}`}>
                    {range.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="panel-control flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm">
            <span className="text-xs text-slate-400 uppercase tracking-wide">Model</span>
            <select value={modelFilter} onChange={event => setModelFilter(event.target.value as 'All' | 'FRS' | 'PPE')} className="text-sm bg-transparent outline-none">
              {['All', 'FRS', 'PPE'].map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          {timeRange === 'Custom' && (
            <div className="panel-control flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm">
              <input
                type="date"
                value={customStart}
                onChange={event => setCustomStart(event.target.value)}
                max={todayInputMax}
                className="text-sm bg-transparent outline-none"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={event => setCustomEnd(event.target.value)}
                max={todayInputMax}
                className="text-sm bg-transparent outline-none"
              />
            </div>
          )}
          <button onClick={handleExport} style={{ backgroundColor: '#005baa' }} className="text-white px-4 py-2.5 flex items-center gap-2 rounded-xl text-sm font-medium shadow-sm hover:opacity-90 transition-opacity">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.28em] mb-3">System Overview</h2>
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
          <NavCard title="Total Sites" value={counts.sites} loading={loading} icon={Building2} color="bg-blue-500" to="/sites" />
          {isAdmin && (
            <NavCard title="Total Users" value={counts.users} loading={loading} icon={Users} color="bg-indigo-500" to="/users" />
          )}
          <NavCard title="Total Cameras" value={counts.cameras} loading={loading} icon={Camera} color="bg-indigo-500" to="/cameras" />
          <NavCard title="Edge Servers" value={counts.edge_servers} loading={loading} icon={Server} color="bg-sky-500" to="/edge-servers" />
          <NavCard title="Employees" value={counts.employees} loading={loading} icon={Users} color="bg-emerald-500" to="/employees" />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.28em] mb-3">System Health</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NavCard title="Cameras Online" value={counts.cameras_online} loading={loading} icon={Camera} color="bg-green-500" to="/cameras?status=active" badge={{ label: 'Live', type: 'success' }} />
          <NavCard title="Cameras Offline" value={counts.cameras_offline} loading={loading} icon={Camera} color="bg-slate-400" to="/cameras?status=inactive" badge={counts.cameras_offline > 0 ? { label: 'Attention', type: 'danger' } : undefined} />
          <NavCard title="Edge Servers Online" value={counts.edge_servers_online} loading={loading} icon={Server} color="bg-emerald-500" to="/edge-servers?status=active" badge={{ label: 'Healthy', type: 'success' }} />
          <NavCard title="Edge Servers Offline" value={counts.edge_servers_offline} loading={loading} icon={Server} color="bg-slate-400" to="/edge-servers?status=inactive" badge={counts.edge_servers_offline > 0 ? { label: 'Investigate', type: 'danger' } : undefined} />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.28em] mb-3">AI Activity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <NavCard title="Total Events" value={counts.total_events} loading={loading} icon={Activity} color="bg-[#005baa]" to="/events" />
          <NavCard title="FRS Detections" value={counts.frs_detections} loading={loading} icon={UserCheck} color="bg-blue-500" to="/events?type=FRS" />
          <NavCard title="Unknown Faces" value={counts.unknown_faces} loading={loading} icon={UserX} color="bg-orange-500" to="/events?unknown=true" badge={counts.unknown_faces > 0 ? { label: 'Review Required', type: 'warn' } : undefined} />
          <NavCard title="PPE Detections" value={counts.ppe_detections} loading={loading} icon={HardHat} color="bg-[#00adef]" to="/events?type=PPE" />
          <NavCard title="PPE Violations" value={counts.ppe_violations} loading={loading} icon={ShieldAlert} color="bg-red-500" to="/violations?status=open" badge={counts.ppe_violations > 0 ? { label: 'Action Needed', type: 'danger' } : undefined} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="data-card p-5 rounded-2xl lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="font-bold text-white">Activity Trend</h3>
              <p className="text-xs text-slate-400 mt-1">
                Live event and violation flow{modelFilter !== 'All' ? ` - ${modelFilter} only` : ''}
              </p>
            </div>
            <span className="text-xs text-slate-300 bg-white/5 px-2 py-1 rounded-full border border-white/8">{selectedLabel}</span>
          </div>
          {chartLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-[#005baa] rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} accessibilityLayer={false}>
                <defs>
                  <linearGradient id="gEv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gViol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.14)" />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '10px', border: '1px solid rgba(148,163,184,0.14)', backgroundColor: '#0f172a', boxShadow: '0 18px 36px rgba(0,0,0,0.24)' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#cbd5e1' }}
                  wrapperStyle={{ outline: 'none' }}
                />
                <Area type="monotone" dataKey="events" stroke="#38bdf8" strokeWidth={2.5} fill="url(#gEv)" activeDot={false} />
                <Area type="monotone" dataKey="violations" stroke="#ef4444" strokeWidth={2.2} fill="url(#gViol)" activeDot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="data-card p-5 rounded-2xl">
          <h3 className="font-bold text-white">Camera Health</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">Current status across connected cameras</p>
          {chartLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart accessibilityLayer={false}>
                  <Pie data={cameraHealthData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={4} activeShape={undefined}>
                    {cameraHealthData.map(item => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    cursor={false}
                    contentStyle={{ borderRadius: '10px', border: '1px solid rgba(148,163,184,0.14)', backgroundColor: '#0f172a', boxShadow: '0 18px 36px rgba(0,0,0,0.24)' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    labelStyle={{ color: '#cbd5e1' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-4 mt-2">
                {cameraHealthData.map(item => (
                  <div key={item.name} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.name} ({item.value})</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="data-card p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="font-bold text-white">Top Violation Types</h3>
              <p className="text-xs text-slate-400 mt-1">Recent violation distribution</p>
            </div>
            <TrendingUp size={16} className="text-slate-500" />
          </div>
          {chartLoading ? (
            <div className="h-56 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-[#005baa] rounded-full animate-spin" />
            </div>
          ) : violationTypeData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">No violation data available for the selected range.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={violationTypeData} layout="vertical" margin={{ left: 24 }} accessibilityLayer={false}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis dataKey="type" type="category" stroke="#94a3b8" fontSize={11} width={110} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '10px', border: '1px solid rgba(148,163,184,0.14)', backgroundColor: '#0f172a', boxShadow: '0 18px 36px rgba(0,0,0,0.24)' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#cbd5e1' }}
                  wrapperStyle={{ outline: 'none' }}
                />
                <Bar dataKey="count" fill="#0ea5e9" radius={[0, 6, 6, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="data-card p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-white">Operational Summary</h3>
              <p className="text-xs text-slate-400 mt-1">Live system health and action items</p>
            </div>
            <Eye size={16} className="text-slate-500" />
          </div>
          {chartLoading ? (
            <div className="h-56 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-[#005baa] rounded-full animate-spin" />
            </div>
          ) : activityFeed.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">No operational updates for the selected range.</div>
          ) : (
            <div className="space-y-3 max-h-[220px] overflow-y-auto scrollbar-thin pr-1">
              {activityFeed.map(item => (
                <div key={item.id} className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/6 px-4 py-3">
                  <div className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center ${item.kind === 'healthy' ? 'bg-emerald-500/14 text-emerald-300' : item.kind === 'danger' ? 'bg-red-500/14 text-red-300' : 'bg-amber-500/14 text-amber-300'}`}>
                    {item.kind === 'healthy' ? <CheckCircle2 size={16} /> : item.kind === 'danger' ? <AlertTriangle size={16} /> : <ShieldAlert size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-white font-medium">{item.title}</p>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-5">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="table-shell rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Activity size={17} className="text-blue-500" /> Recent Events
            </h3>
            <span className="text-xs text-slate-400">Latest 8</span>
          </div>
          {chartLoading ? (
            <div className="p-8 text-center text-slate-400 animate-pulse text-sm">Loading events...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 bg-white/5 border-b border-white/8">
                  <tr>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Site</th>
                    <th className="px-4 py-3 font-medium">Camera</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Person</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium text-right">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecentEvents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-xs text-slate-400">
                        No events recorded for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    visibleRecentEvents.map(event => (
                      <tr key={event.id} className="border-b border-white/6 hover:bg-white/4 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">{new Date(event.event_time).toLocaleString()}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">{event.site_name || '-'}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">{event.camera_name ?? '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getEventCategory(event.event_type) === 'FRS' ? 'bg-blue-500/14 text-blue-200' : getEventCategory(event.event_type) === 'PPE' ? 'bg-cyan-500/14 text-cyan-200' : 'bg-slate-500/14 text-slate-300'}`}>
                            {getEventCategory(event.event_type) === 'OTHER' ? 'Other' : getEventCategory(event.event_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">{event.employee_name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">{event.event_type}</td>
                        <td className="px-4 py-3 text-right text-xs text-slate-400">
                          {event.confidence_score != null ? `${Math.round(Number(event.confidence_score))}%` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="table-shell rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2">
              <AlertTriangle size={17} className="text-red-500" /> Recent Violations
            </h3>
            <span className="text-xs text-slate-400">{selectedLabel}</span>
          </div>
          {chartLoading ? (
            <div className="p-8 text-center text-slate-400 animate-pulse text-sm">Loading violations...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 bg-white/5 border-b border-white/8">
                  <tr>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Site</th>
                    <th className="px-4 py-3 font-medium">Camera</th>
                    <th className="px-4 py-3 font-medium">Violation</th>
                    <th className="px-4 py-3 font-medium">Person</th>
                    <th className="px-4 py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecentViolations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-xs text-slate-400">
                        No violations recorded for the selected range.
                      </td>
                    </tr>
                  ) : (
                    visibleRecentViolations.map(violation => (
                      <tr key={violation.id} className="border-b border-white/6 hover:bg-white/4 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">{new Date(violation.violation_time).toLocaleString()}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">{violation.site_name || '-'}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">{violation.camera_name ?? '-'}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">{violation.violation_type}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">{violation.employee_name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-right text-xs">
                          <span className={`px-2 py-0.5 rounded font-semibold ${violation.status === 'resolved' ? 'bg-green-500/14 text-green-200' : 'bg-red-500/14 text-red-200'}`}>
                            {violation.status === 'resolved' ? 'Resolved' : 'Open'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.28em] mb-3">Admin Control</h2>
          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,1.8fr] gap-6">
            <div className="data-card p-5 rounded-2xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-white">Access Control</h3>
                  <p className="text-xs text-slate-400 mt-1">Manage users, roles, status, and profile drill-down</p>
                </div>
                <div className="h-11 w-11 rounded-2xl bg-sky-500/12 text-sky-300 flex items-center justify-center">
                  <UserCog size={20} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-5">
                <div className="rounded-2xl bg-white/5 border border-white/8 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Total Accounts</p>
                  <p className="text-2xl font-bold text-white mt-2">{counts.users}</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/8 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Admins</p>
                  <p className="text-2xl font-bold text-white mt-2">{adminUsers.filter(user => user.role_name === 'admin').length}</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/8 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Active Accounts</p>
                  <p className="text-2xl font-bold text-white mt-2">{adminUsers.filter(user => user.status === 'active').length}</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/8 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Inactive Accounts</p>
                  <p className="text-2xl font-bold text-white mt-2">{adminUsers.filter(user => user.status === 'inactive').length}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => navigate('/users')}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                  style={{ backgroundColor: '#005baa' }}
                >
                  Open Account Management
                </button>
              </div>
            </div>

            <div className="table-shell rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white">Account Directory</h3>
                  <p className="text-xs text-slate-400 mt-1">Click any account to inspect dashboard scope and access</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/users')}
                  className="text-xs text-sky-300 hover:text-sky-200 transition-colors"
                >
                  View all
                </button>
              </div>
              {loading ? (
                <div className="p-8 text-center text-slate-400 animate-pulse text-sm">Loading users...</div>
              ) : adminUserPreview.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No accounts available yet.</div>
              ) : (
                <div className="divide-y divide-white/6">
                  {adminUserPreview.map(user => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => navigate(`/users/${user.id}`)}
                      className="w-full text-left px-5 py-4 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl brand-gradient flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {user.name.split(' ').map(part => part[0]).slice(0, 2).join('')}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                              <p className="text-xs text-slate-400 truncate">{user.email}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-xs text-slate-300">{getRoleLabel(user.role_name)}</p>
                            <p className="text-[11px] text-slate-500">{user.status === 'inactive' ? 'Needs review' : 'Active access'}</p>
                          </div>
                          <ArrowRight size={15} className="text-slate-500" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardOverview;
