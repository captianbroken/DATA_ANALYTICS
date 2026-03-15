import { useState } from 'react';
import { Save, Building2, Brain, Bell } from 'lucide-react';

const SettingsPage = () => {
  const [frsThreshold, setFrsThreshold] = useState(85);
  const [ppeThreshold, setPpeThreshold] = useState(78);
  const [alertCooldown, setAlertCooldown] = useState(30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Configure system preferences and AI detection parameters</p>
      </div>

      {/* Company Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Building2 size={17} className="text-blue-500" />
          <h2 className="font-bold text-slate-800">Company Settings</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            { label: 'Company Name', defaultValue: 'Hyperspark Technologies' },
            { label: 'Admin Email', defaultValue: 'admin@hyperspark.io' },
            { label: 'Phone Number', defaultValue: '+91 98765 43210' },
            { label: 'Location', defaultValue: 'Chennai, India' },
          ].map(field => (
            <div key={field.label}>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{field.label}</label>
              <input defaultValue={field.defaultValue} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
            </div>
          ))}
        </div>
      </div>

      {/* AI Detection Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Brain size={17} className="text-purple-500" />
          <h2 className="font-bold text-slate-800">AI Detection Settings</h2>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs font-medium text-slate-700">FRS Confidence Threshold</label>
              <span className="text-xs font-bold text-blue-600">{frsThreshold}%</span>
            </div>
            <input
              type="range"
              value={frsThreshold}
              min={50}
              max={99}
              onChange={event => setFrsThreshold(Number(event.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-slate-400 mt-1">Minimum confidence % for face recognition matches</p>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs font-medium text-slate-700">PPE Detection Threshold</label>
              <span className="text-xs font-bold text-blue-600">{ppeThreshold}%</span>
            </div>
            <input
              type="range"
              value={ppeThreshold}
              min={50}
              max={99}
              onChange={event => setPpeThreshold(Number(event.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-slate-400 mt-1">Minimum confidence % for PPE compliance check</p>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs font-medium text-slate-700">Alert Cooldown (seconds)</label>
              <span className="text-xs font-bold text-blue-600">{alertCooldown}s</span>
            </div>
            <input
              type="range"
              value={alertCooldown}
              min={5}
              max={300}
              step={5}
              onChange={event => setAlertCooldown(Number(event.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-slate-400 mt-1">Minimum time between repeated alerts for same person</p>
          </div>

          <div className="flex items-center justify-between py-3 border-t border-slate-100">
            <div>
              <p className="text-sm font-medium text-slate-700">Enable Real-time Alerts</p>
              <p className="text-xs text-slate-400">Send instant notifications on violations</p>
            </div>
            <button className="relative w-11 h-6 bg-blue-500 rounded-full transition-colors focus:outline-none">
              <span className="absolute left-[22px] top-1 w-4 h-4 bg-white rounded-full shadow transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Bell size={17} className="text-amber-500" />
          <h2 className="font-bold text-slate-800">Notification Preferences</h2>
        </div>
        <div className="p-6 space-y-4">
          {[
            { label: 'Email Alerts for New Violations', enabled: true },
            { label: 'Email Daily Summary Report', enabled: false },
            { label: 'Browser Push Notifications', enabled: true },
            { label: 'Slack / Webhook Integration', enabled: false },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-2">
              <p className="text-sm text-slate-700">{item.label}</p>
              <button className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${item.enabled ? 'bg-blue-500' : 'bg-slate-200'}`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.enabled ? 'left-[22px]' : 'left-1'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button style={{ backgroundColor: '#005baa' }} className="text-white px-6 py-2.5 flex items-center gap-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-sm">
          <Save size={15} /> Save Settings
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
