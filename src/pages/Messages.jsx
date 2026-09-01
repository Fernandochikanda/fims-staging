// /src/pages/Messages.jsx - Adicione um estado para forçar re-render

import { useState, useEffect, useRef } from "react";
import { useComms } from "../context/CommsContext";
import { ROLES } from "../data/constants";
import { Icon } from "../lib/icons";

export default function Messages({ users, currentUser }) {
  const { 
    messages, 
    draft, 
    setDraft, 
    sendMessage, 
    sendBroadcast,
    getConversation, 
    getUnreadCount,
    getRecentContacts,
    markAllAsRead,
    clearDraft,
    announcements,
    getUnseenAnnouncements,
    confirmAnnouncement,
    replyToAnnouncement,
    createAnnouncement,
    dismissAnnouncement
  } = useComms();
  
  const [activeChat, setActiveChat] = useState(null);
  const [text, setText] = useState(draft || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastTarget, setBroadcastTarget] = useState("all");
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementTarget, setAnnouncementTarget] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0); // Forçar re-render
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Forçar atualização quando announcements mudar
  useEffect(() => {
    setRefreshKey(prev => prev + 1);
  }, [announcements]);

  // Forçar atualização quando messages mudar
  useEffect(() => {
    setRefreshKey(prev => prev + 1);
  }, [messages]);

  // Restaurar rascunho
  useEffect(() => {
    if (activeChat) {
      setText(draft || "");
    }
  }, [activeChat, draft]);

  // Salvar rascunho
  useEffect(() => {
    const timer = setTimeout(() => {
      if (text && text.trim()) {
        setDraft(text);
      } else {
        setDraft("");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, setDraft]);

  // Scroll para o final
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeChat, refreshKey]);

  // Foco no textarea
  useEffect(() => {
    if (activeChat && textareaRef.current) {
      setTimeout(() => textareaRef.current.focus(), 100);
    }
  }, [activeChat]);

  // Verificar anúncios não visualizados
  const unseenAnnouncements = getUnseenAnnouncements(currentUser.id);

  // Determinar com quem o usuário pode falar
  const getAvailableUsers = () => {
    let available = [];
    
    if (currentUser.role === ROLES.INSPECTOR) {
      available = users.filter(u => 
        u.role === ROLES.SUPERVISOR || u.role === ROLES.ADMIN
      );
    } else if (currentUser.role === ROLES.SUPERVISOR) {
      available = users.filter(u => 
        u.role === ROLES.INSPECTOR || u.role === ROLES.CEO || u.role === ROLES.ADMIN
      );
    } else if (currentUser.role === ROLES.CEO) {
      available = users.filter(u => 
        u.role === ROLES.SUPERVISOR || u.role === ROLES.ADMIN
      );
    } else {
      available = users.filter(u => u.id !== currentUser.id);
    }
    
    return available;
  };

  const recentContacts = getRecentContacts(currentUser.id);
  const availableUsers = getAvailableUsers();
  
  const contactList = availableUsers.map(u => {
    const recent = recentContacts.find(r => r?.contactId === u.id);
    return {
      user: u,
      lastMessage: recent || null,
      unread: getUnreadCount(u.id)
    };
  }).sort((a, b) => {
    if (a.unread > 0 && b.unread === 0) return -1;
    if (a.unread === 0 && b.unread > 0) return 1;
    return new Date(b.lastMessage?.timestamp || 0) - new Date(a.lastMessage?.timestamp || 0);
  });

  const filteredContacts = contactList.filter(c => 
    c.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Enviar mensagem
  const handleSend = () => {
    if (!text.trim() || !activeChat) return;
    
    sendMessage(currentUser.id, activeChat.id, text.trim());
    setText("");
    clearDraft();
    markAllAsRead(activeChat.id);
  };

  // Enviar broadcast
  const handleBroadcast = () => {
    if (!broadcastText.trim()) return;
    
    const targetRole = broadcastTarget === "all" ? null : broadcastTarget;
    sendBroadcast(currentUser.id, broadcastText.trim(), targetRole);
    setBroadcastText("");
    setShowBroadcast(false);
  };

  // Criar anúncio
  const handleCreateAnnouncement = () => {
    if (!announcementTitle.trim() || !announcementText.trim()) return;
    
    const targetRole = announcementTarget === "all" ? null : announcementTarget;
    createAnnouncement(currentUser.id, announcementTitle.trim(), announcementText.trim(), targetRole);
    setAnnouncementTitle("");
    setAnnouncementText("");
    setShowAnnouncements(false);
  };

  // Confirmar anúncio (OK Recebido) - CORRIGIDO
  const handleConfirmAnnouncement = (announcementId) => {
    confirmAnnouncement(announcementId, currentUser.id);
    // Forçar atualização imediata
    setRefreshKey(prev => prev + 1);
  };

  // Responder anúncio - CORRIGIDO
  const handleReplyAnnouncement = (announcementId) => {
    const reply = prompt("Responder ao anúncio:", "");
    if (reply !== null && reply.trim()) {
      replyToAnnouncement(announcementId, currentUser.id, reply.trim());
      // Marcar como visualizado após responder
      dismissAnnouncement(announcementId, currentUser.id);
      setRefreshKey(prev => prev + 1);
    }
  };

  // Dispensar anúncio - CORRIGIDO
  const handleDismissAnnouncement = (announcementId) => {
    dismissAnnouncement(announcementId, currentUser.id);
    setRefreshKey(prev => prev + 1);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectChat = (contact) => {
    setActiveChat(contact.user);
    markAllAsRead(contact.user.id);
    setText(draft || "");
  };

  const chatMessages = activeChat 
    ? getConversation(currentUser.id, activeChat.id)
    : [];

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
  };

  const groupMessagesByDate = (msgs) => {
    const groups = {};
    msgs.forEach(msg => {
      const date = new Date(msg.timestamp).toLocaleDateString("pt-PT");
      if (!groups[date]) groups[date] = [];
      groups[date].push(msg);
    });
    return groups;
  };

  const groupedMessages = groupMessagesByDate(chatMessages);

  return (
    <div style={{ 
      display: "flex", 
      height: "calc(100vh - 160px)", 
      background: "#fff", 
      borderRadius: 12, 
      border: "1px solid #E5E7EB", 
      overflow: "hidden"
    }}>
      {/* Sidebar */}
      <div style={{ 
        width: 280, 
        borderRight: "1px solid #E5E7EB", 
        display: "flex", 
        flexDirection: "column",
        background: "#F9FAFB"
      }}>
        <div style={{ 
          padding: "16px", 
          fontWeight: 600, 
          borderBottom: "1px solid #E5E7EB",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8
        }}>
          <span>💬 Conversas</span>
          <div style={{ display: "flex", gap: 6 }}>
            {unseenAnnouncements.length > 0 && (
              <span style={{ 
                background: "#A32D2D", 
                color: "white", 
                borderRadius: 12, 
                padding: "2px 10px", 
                fontSize: 10,
                fontWeight: 600
              }}>
                📢 {unseenAnnouncements.length}
              </span>
            )}
            <span style={{ fontSize: 12, color: "#888" }}>
              {contactList.filter(c => c.unread > 0).length} não lidas
            </span>
          </div>
        </div>
        
        <div style={{ padding: "10px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="🔍 Buscar contato..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid #D1D5DB",
              borderRadius: 6,
              fontSize: 13,
              outline: "none",
              minWidth: 100
            }}
          />
          {(currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.CEO || currentUser.role === ROLES.SUPERVISOR) && (
            <button 
              className="btn btn-sm btn-primary"
              onClick={() => setShowBroadcast(!showBroadcast)}
              style={{ padding: "6px 10px", fontSize: 12 }}
            >
              📢
            </button>
          )}
        </div>

        {showBroadcast && (
          <div style={{ 
            padding: "12px", 
            borderBottom: "1px solid #E5E7EB",
            background: "#E6F1FB"
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>📢 Enviar Broadcast</div>
            <textarea
              placeholder="Mensagem para todos..."
              value={broadcastText}
              onChange={e => setBroadcastText(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                fontSize: 13,
                resize: "vertical",
                minHeight: 50,
                outline: "none",
                fontFamily: "inherit"
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <select
                value={broadcastTarget}
                onChange={e => setBroadcastTarget(e.target.value)}
                style={{
                  padding: "4px 8px",
                  border: "1px solid #D1D5DB",
                  borderRadius: 4,
                  fontSize: 12,
                  flex: 1
                }}
              >
                <option value="all">Todos</option>
                <option value={ROLES.INSPECTOR}>Inspetores</option>
                <option value={ROLES.SUPERVISOR}>Supervisores</option>
                <option value={ROLES.CEO}>CEO</option>
                <option value={ROLES.ADMIN}>Admin</option>
              </select>
              <button 
                className="btn btn-primary btn-sm"
                onClick={handleBroadcast}
                disabled={!broadcastText.trim()}
                style={{ padding: "4px 12px", fontSize: 12 }}
              >
                Enviar
              </button>
              <button 
                className="btn btn-sm btn-secondary"
                onClick={() => setShowBroadcast(false)}
                style={{ padding: "4px 8px", fontSize: 12 }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredContacts.length === 0 ? (
            <div style={{ 
              padding: "40px 20px", 
              textAlign: "center", 
              color: "#888",
              fontSize: 13
            }}>
              {searchTerm ? "Nenhum contato encontrado" : "Nenhuma conversa ativa"}
            </div>
          ) : (
            filteredContacts.map(contact => (
              <div 
                key={contact.user.id} 
                onClick={() => handleSelectChat(contact)} 
                style={{ 
                  padding: "12px 16px", 
                  cursor: "pointer", 
                  borderBottom: "1px solid #F3F4F6",
                  background: activeChat?.id === contact.user.id ? "#E6F1FB" : "transparent",
                  display: "flex", 
                  alignItems: "center", 
                  gap: 12,
                  transition: "background 0.2s",
                  position: "relative"
                }}
              >
                <div style={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: "50%", 
                  background: "#1E2A3A", 
                  color: "#fff", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  fontSize: 14, 
                  fontWeight: 600,
                  flexShrink: 0
                }}>
                  {contact.user.avatar || contact.user.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center"
                  }}>
                    <div style={{ 
                      fontSize: 14, 
                      fontWeight: contact.unread > 0 ? 600 : 500,
                      color: contact.unread > 0 ? "#1E2A3A" : "#4B5563"
                    }}>
                      {contact.user.name}
                    </div>
                    {contact.lastMessage && (
                      <div style={{ fontSize: 10, color: "#888" }}>
                        {formatTime(contact.lastMessage.timestamp)}
                      </div>
                    )}
                  </div>
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    marginTop: 2
                  }}>
                    <div style={{ 
                      fontSize: 12, 
                      color: contact.unread > 0 ? "#1E2A3A" : "#888",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 130,
                      fontWeight: contact.unread > 0 ? 500 : 400
                    }}>
                      {contact.lastMessage?.text || `Clique para conversar`}
                    </div>
                    {contact.unread > 0 && (
                      <span style={{
                        background: "#A32D2D",
                        color: "white",
                        borderRadius: "50%",
                        padding: "2px 8px",
                        fontSize: 10,
                        fontWeight: 600,
                        minWidth: 20,
                        textAlign: "center"
                      }}>
                        {contact.unread}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: "#aaa", marginTop: 1 }}>
                    {contact.user.role === ROLES.INSPECTOR ? "🔍 Inspetor" :
                     contact.user.role === ROLES.SUPERVISOR ? "📋 Supervisor" :
                     contact.user.role === ROLES.CEO ? "👔 CEO" : "⚙️ Admin"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#fff" }}>
        {activeChat ? (
          <>
            <div style={{ 
              padding: "16px 20px", 
              borderBottom: "1px solid #E5E7EB", 
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#F9FAFB"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ 
                  width: 36, 
                  height: 36, 
                  borderRadius: "50%", 
                  background: "#1E2A3A", 
                  color: "#fff", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  fontSize: 13, 
                  fontWeight: 600
                }}>
                  {activeChat.avatar || activeChat.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{activeChat.name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>
                    {activeChat.role === ROLES.INSPECTOR ? "🔍 Inspetor" :
                     activeChat.role === ROLES.SUPERVISOR ? "📋 Supervisor" :
                     activeChat.role === ROLES.CEO ? "👔 CEO" : "⚙️ Admin"}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>
                {getUnreadCount(activeChat.id) > 0 && (
                  <span style={{ color: "#A32D2D" }}>
                    {getUnreadCount(activeChat.id)} não lidas
                  </span>
                )}
              </div>
            </div>

            <div style={{ 
              flex: 1, 
              padding: "16px 20px", 
              overflowY: "auto", 
              background: "#FAFAFA",
              display: "flex",
              flexDirection: "column",
              gap: 8
            }}>
              {/* Anúncios não visualizados - CORRIGIDO */}
              {unseenAnnouncements.length > 0 && (
                <div style={{ 
                  background: "#E6F1FB", 
                  border: "1px solid #3B82F6",
                  borderRadius: 8,
                  padding: "12px 16px",
                  marginBottom: 12
                }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1E2A3A" }}>
                    📢 {unseenAnnouncements.length} anúncio(s) não visualizado(s)
                  </div>
                  {unseenAnnouncements.map(a => (
                    <div key={a.id} style={{ 
                      background: "white", 
                      borderRadius: 6, 
                      padding: "10px 14px", 
                      marginTop: 8,
                      border: "1px solid #E5E7EB"
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                      <div style={{ fontSize: 13, color: "#4B5563", marginTop: 4 }}>{a.text}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                        {new Date(a.timestamp).toLocaleString("pt-PT")}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={() => handleConfirmAnnouncement(a.id)}
                          style={{ padding: "4px 14px", fontSize: 12 }}
                        >
                          ✅ OK Recebido
                        </button>
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleReplyAnnouncement(a.id)}
                          style={{ padding: "4px 14px", fontSize: 12 }}
                        >
                          💬 Responder
                        </button>
                        <button 
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDismissAnnouncement(a.id)}
                          style={{ padding: "4px 10px", fontSize: 12 }}
                        >
                          ✕ Dispensar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {Object.keys(groupedMessages).length === 0 ? (
                <div style={{ 
                  flex: 1, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  color: "#888",
                  fontSize: 14,
                  flexDirection: "column",
                  gap: 8
                }}>
                  <span style={{ fontSize: 40 }}>💬</span>
                  <span>Nenhuma mensagem ainda</span>
                  <span style={{ fontSize: 12, color: "#aaa" }}>
                    Envie uma mensagem para {activeChat.name}
                  </span>
                </div>
              ) : (
                Object.entries(groupedMessages).map(([date, msgs]) => (
                  <div key={date}>
                    <div style={{ 
                      textAlign: "center", 
                      fontSize: 11, 
                      color: "#888",
                      padding: "4px 0",
                      marginBottom: 8
                    }}>
                      {date === new Date().toLocaleDateString("pt-PT") ? "Hoje" : date}
                    </div>
                    {msgs.map(msg => {
                      const isOwn = msg.fromId === currentUser.id;
                      const isBroadcast = msg.isBroadcast || msg.toId === 'broadcast';
                      const isConfirmation = msg.isConfirmation;
                      
                      return (
                        <div 
                          key={msg.id} 
                          style={{ 
                            display: "flex",
                            justifyContent: isOwn ? "flex-end" : "flex-start",
                            marginBottom: 4
                          }}
                        >
                          <div style={{ maxWidth: "75%" }}>
                            <div style={{ 
                              background: isBroadcast ? "#FEF3C7" : (isOwn ? "#1E2A3A" : "#fff"),
                              color: isBroadcast ? "#92400E" : (isOwn ? "#fff" : "#1F2937"),
                              padding: "10px 14px", 
                              borderRadius: 12, 
                              borderBottomRightRadius: isOwn ? 4 : 12,
                              borderBottomLeftRadius: isOwn ? 12 : 4,
                              border: isOwn ? "none" : "1px solid #E5E7EB",
                              fontSize: 13,
                              wordWrap: "break-word",
                              boxShadow: isOwn ? "none" : "0 1px 2px rgba(0,0,0,0.05)"
                            }}>
                              {isBroadcast && <span style={{ fontWeight: 600 }}>📢 </span>}
                              {isConfirmation && <span style={{ fontWeight: 600 }}>✅ </span>}
                              {msg.text}
                            </div>
                            <div style={{ 
                              fontSize: 9, 
                              color: "#aaa", 
                              textAlign: isOwn ? "right" : "left", 
                              marginTop: 4,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              justifyContent: isOwn ? "flex-end" : "flex-start"
                            }}>
                              {isBroadcast && <span>📢 Broadcast</span>}
                              {formatTime(msg.timestamp)}
                              {isOwn && msg.read && (
                                <span style={{ color: "#0F6E56" }}>✓✓ Lida</span>
                              )}
                              {isOwn && !msg.read && (
                                <span style={{ color: "#888" }}>✓ Enviada</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ 
              padding: "12px 16px", 
              borderTop: "1px solid #E5E7EB", 
              display: "flex", 
              gap: 8,
              background: "#fff",
              alignItems: "flex-end"
            }}>
              <textarea 
                ref={textareaRef}
                className="form-input" 
                placeholder={`Escrever mensagem para ${activeChat.name}...`} 
                value={text} 
                onChange={e => setText(e.target.value)} 
                onKeyDown={handleKeyDown}
                style={{ 
                  flex: 1, 
                  resize: "vertical",
                  minHeight: 40,
                  maxHeight: 120,
                  padding: "10px 12px",
                  border: "1px solid #D1D5DB",
                  borderRadius: 8,
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "inherit"
                }}
                rows={1}
              />
              <button 
                className="btn btn-primary" 
                onClick={handleSend}
                disabled={!text.trim()}
                style={{
                  padding: "10px 20px",
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: text.trim() ? "#1E2A3A" : "#D1D5DB",
                  color: text.trim() ? "white" : "#888",
                  border: "none",
                  borderRadius: 8,
                  cursor: text.trim() ? "pointer" : "not-allowed",
                  fontSize: 13,
                  fontWeight: 500,
                  transition: "all 0.2s"
                }}
              >
                <Icon name="send" size={14} />
                Enviar
              </button>
            </div>
          </>
        ) : (
          <div style={{ 
            flex: 1, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
            color: "#888"
          }}>
            <span style={{ fontSize: 48 }}>💬</span>
            <span style={{ fontSize: 16, fontWeight: 500 }}>Selecione uma conversa</span>
            <span style={{ fontSize: 13 }}>Escolha um contato da lista ao lado para começar</span>
          </div>
        )}
      </div>
    </div>
  );
}
