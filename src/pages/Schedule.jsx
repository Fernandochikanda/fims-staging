import { useState } from "react";
import { Icon } from "../lib/icons";
import { INSPECTOR_COLORS, PRIORITY_LEVELS } from "../data/constants";
import { startOfWeek } from "../lib/icsExporter";

export default function Schedule({ inspections, users, onUpdate, onOpenModal, onReschedule, onBulkSchedule }) {
  const [view, setView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [draggedTask, setDraggedTask] = useState(null);
  const [dropConfirm, setDropConfirm] = useState(null); // { task, date, inspectorId }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek(currentDate));
    d.setDate(d.getDate() + i);
    return d;
  });

  const changeDate = (days) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  // Analytics for today
  const todayStr = new Date().toISOString().split("T")[0];
  const todayTasks = inspections.filter(i => i.date === todayStr && i.type !== "leave");
  const stats = {
    total: todayTasks.length,
    pending: todayTasks.filter(i => i.status === "pending_acceptance").length,
    progress: todayTasks.filter(i => i.status === "in_progress").length,
    done: todayTasks.filter(i => i.status === "submitted" || i.status === "reviewed").length
  };

  const handleDrop = (e, dropDate, dropInspectorId) => {
    e.preventDefault();
    if (draggedTask) {
      const formattedDate = dropDate.toISOString().split("T")[0];
      // If dropping on the same day/inspector, do nothing
      if (draggedTask.date === formattedDate && draggedTask.inspector_id === dropInspectorId) return;
      
      // Show confirmation dialog
      setDropConfirm({ task: draggedTask, date: formattedDate, inspectorId: dropInspectorId, inspectorName: users.find(u => u.id === dropInspectorId)?.name || "Unassigned" });
      setDraggedTask(null);
    }
  };

  const confirmMove = (notify) => {
    const { task, date, inspectorId, inspectorName } = dropConfirm;
    onUpdate({ 
      ...task, 
      date, 
      inspector_id: inspectorId, 
      inspector_name: inspectorName,
      status: inspectorId ? "pending_acceptance" : "unassigned"
    }, notify);
    setDropConfirm(null);
  };

  const inspectors = users.filter(u => u.role === "inspector" || u.role === "INSPECTOR");
  const unassignedTasks = inspections.filter(i => !i.inspector_id && i.type !== "leave");

  const renderTaskCard = (task) => {
    const inspColor = task.inspector_id ? INSPECTOR_COLORS[task.inspector_id] : "#888";
    const prioColor = PRIORITY_LEVELS[task.priority]?.color || PRIORITY_LEVELS.normal.color;
    
    return (
      <div 
        key={task.id} 
        draggable 
        onDragStart={() => setDraggedTask(task)}
        style={{ 
          background: "#fff", borderLeft: `4px solid ${inspColor}`, 
          padding: "8px", borderRadius: "4px", fontSize: "11px", marginTop: "6px", 
          cursor: "grab", boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: 50, background: prioColor, display: "inline-block" }}></span>
          <span style={{ fontSize: 9, color: task.status === "rejected" ? "#A32D2D" : "#888" }}>{task.status === "pending_acceptance" ? "Pending" : task.status}</span>
        </div>
        <div style={{ fontWeight: 600, color: "#1E2A3A", marginTop: 4 }}>{task.start_time || ""} {task.location_name}</div>
        <div style={{ color: "#666" }}>{task.inspector_name || "Unassigned"}</div>
        <button onClick={() => onReschedule(task)} style={{ fontSize: 9, color: "#378ADD", border: "none", background: "transparent", cursor: "pointer", marginTop: 4, padding: 0 }}>
          Reschedule / Edit
        </button>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div><div className="page-title">Operations Calendar</div><div className="page-sub">Drag-and-drop dispatching</div></div>
        
        {/* Quick Actions Panel */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
            <button onClick={() => setView("day")} style={{ padding: "6px 12px", background: view === "day" ? "#1E2A3A" : "#fff", color: view === "day" ? "#fff" : "#333", border: "none", cursor: "pointer" }}>Day</button>
            <button onClick={() => setView("week")} style={{ padding: "6px 12px", background: view === "week" ? "#1E2A3A" : "#fff", color: view === "week" ? "#fff" : "#333", border: "none", cursor: "pointer" }}>Week</button>
            <button onClick={() => setView("month")} style={{ padding: "6px 12px", background: view === "month" ? "#1E2A3A" : "#fff", color: view === "month" ? "#fff" : "#333", border: "none", cursor: "pointer" }}>Month</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => changeDate(-7)}>←</button>
          <span style={{ fontWeight: 500, fontSize: 14 }}>{weekDays[0].toLocaleDateString("pt-PT", { month: "short", day: "numeric" })} - {weekDays[6].toLocaleDateString("pt-PT", { month: "short", day: "numeric" })}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => changeDate(7)}>→</button>
          <button className="btn btn-secondary btn-sm" onClick={onBulkSchedule}><Icon name="file" size={13} /> Bulk</button>
          <button className="btn btn-primary btn-sm" onClick={onOpenModal}><Icon name="plus" size={13} /> Dispatch</button>
        </div>
      </div>

      {/* Workload Analytics Dashboard */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #eee" }}>
          <div style={{ fontSize: 11, color: "#888" }}>Total Today</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{stats.total}</div>
        </div>
        <div style={{ flex: 1, background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #eee" }}>
          <div style={{ fontSize: 11, color: "#EF9F27" }}>Pending Acceptance</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{stats.pending}</div>
        </div>
        <div style={{ flex: 1, background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #eee" }}>
          <div style={{ fontSize: 11, color: "#534AB7" }}>In Progress</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{stats.progress}</div>
        </div>
        <div style={{ flex: 1, background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #eee" }}>
          <div style={{ fontSize: 11, color: "#0F6E56" }}>Completed</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{stats.done}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", minWidth: "900px" }}>
        {/* Unassigned Dispatch Queue */}
        <div 
          style={{ width: 200, minWidth: 200, background: "#F8F7F4", borderRadius: 8, padding: 8, border: "1px dashed #ccc" }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, new Date(), null)}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 8 }}>📥 Unassigned / To Dispatch</div>
          {unassignedTasks.map(task => renderTaskCard(task))}
          {unassignedTasks.length === 0 && <div style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 20 }}>Drag here to unassign</div>}
        </div>

        {/* Calendar Grid */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px" }}>
          {weekDays.map((day, i) => {
            const dayStr = day.toISOString().split("T")[0];
            const dayInspections = inspections.filter(insp => insp.date === dayStr && insp.inspector_id);
            const isToday = dayStr === new Date().toISOString().split("T")[0];

            return (
              <div key={i} style={{ background: "#fff", border: `1px solid ${isToday ? "#378ADD" : "#e0e0e0"}`, borderRadius: "8px", minHeight: "400px", padding: "8px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isToday ? "#378ADD" : "#888", marginBottom: "8px", textAlign: "center", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                  {day.toLocaleDateString("pt-PT", { weekday: 'short', day: 'numeric' })}
                </div>
                
                <div 
                  style={{ minHeight: "350px" }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, day, draggedTask?.inspector_id || 4)}
                >
                  {inspectors.map(insp => {
                    const inspTasks = dayInspections.filter(t => t.inspector_id === insp.id);
                    if (inspTasks.length === 0) return null;
                    return (
                      <div key={insp.id} 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, day, insp.id)}
                      >
                        {inspTasks.map(task => renderTaskCard(task))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag & Drop Confirmation Modal */}
      {dropConfirm && (
        <div className="modal-overlay" onClick={() => setDropConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header"><div style={{ fontSize: 15, fontWeight: 500 }}>Move Inspection?</div><button className="icon-btn" onClick={() => setDropConfirm(null)}><Icon name="x" size={14} /></button></div>
            <div className="modal-body">
              <div style={{ background: "#F8F7F4", padding: 12, borderRadius: 8, fontSize: 13 }}>
                <strong>Client:</strong> {dropConfirm.task.location_name}<br/>
                <strong>From:</strong> {dropConfirm.task.date} {dropConfirm.task.start_time || ""}<br/>
                <strong>To:</strong> {dropConfirm.date} ({dropConfirm.inspectorName})
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDropConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => confirmMove(true)}>Confirm & Notify</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
