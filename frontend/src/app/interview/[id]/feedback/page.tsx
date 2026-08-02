'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ChevronLeft, Award, Download, TrendingUp, AlertTriangle,
  RefreshCw, Sparkles, Trophy, Target, Zap, Brain,
  MessageSquare, Code2, Users, RotateCcw, ExternalLink,
} from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts';
import { sessionApi, feedbackApi } from '@/lib/api';
import { Loader } from '@/components/ui/loader';
import { useConfetti } from './useConfetti';
import ScoreRing from './ScoreRing';
import FeedbackCards from './FeedbackCards';
import TranscriptViewer from './TranscriptViewer';

interface Feedback {
  overall_score: number;
  technical_score: number;
  communication_score: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  percentile?: { percentile: number; message: string };
  pdf_url?: string;
}

export default function InterviewFeedbackPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<any>(null);
  const [turns, setTurns] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const confettiRef = useConfetti(showConfetti);

  useEffect(() => {
    async function loadFeedback() {
      try {
        setLoading(true);
        const s = await sessionApi.get(sessionId);
        setSession(s);

        let conversationTurns: any[] = [];
        try {
          const turnsData = await sessionApi.getTurns(sessionId);
          conversationTurns = Array.isArray(turnsData) ? turnsData : turnsData?.turns || [];
        } catch {
          conversationTurns = [];
        }
        setTurns(conversationTurns);

        try {
          let fb = await feedbackApi.get(sessionId);
          if (!fb || !fb.overall_score) {
            fb = await feedbackApi.generate(sessionId, {
              session_id: sessionId,
              interview_type: s.interview_type,
              difficulty: s.difficulty,
              transcript: conversationTurns.map((t: any) => ({
                role: t.role,
                content: t.content,
              })),
            });
          }
          // Normalize API response → flat Feedback interface
          // API returns: { overall_score, scores: { problem_solving_score, communication_score, ... },
          //               detailed_feedback: { strengths, weaknesses, recommendations }, pdf_url, percentile }
          const normalized: Feedback = {
            overall_score: fb.overall_score ?? 0,
            technical_score: fb.scores?.problem_solving_score ?? fb.technical_score ?? 0,
            communication_score: fb.scores?.communication_score ?? fb.communication_score ?? 0,
            strengths: fb.detailed_feedback?.strengths ?? fb.strengths ?? [],
            weaknesses: fb.detailed_feedback?.weaknesses ?? fb.weaknesses ?? [],
            recommendations: fb.detailed_feedback?.recommendations ?? fb.recommendations ?? [],
            percentile: fb.percentile ?? undefined,
            pdf_url: fb.pdf_url ?? undefined,
          };
          setFeedback(normalized);
          if (normalized.overall_score >= 70) setTimeout(() => setShowConfetti(true), 600);
        } catch (apiErr) {
          console.warn('Feedback Service failed. Using local fallback:', apiErr);
          setUsingFallback(true);
          await new Promise((r) => setTimeout(r, 1500));

          const userMsgs = conversationTurns.filter((t: any) => t.role === 'candidate');
          const totalWords = userMsgs.reduce(
            (sum: number, t: any) => sum + (t.content || '').split(/\s+/).filter(Boolean).length,
            0
          );
          const meaningfulTurns = userMsgs.filter(
            (t: any) => (t.content || '').split(/\s+/).filter(Boolean).length >= 5
          ).length;

          if (userMsgs.length < 2 || totalWords < 30 || meaningfulTurns < 2) {
            setFeedback({
              overall_score: 0,
              technical_score: 0,
              communication_score: 0,
              strengths: [],
              weaknesses: [
                'No meaningful answers were provided during the interview',
                'The session ended without sufficient participation to evaluate',
              ],
              recommendations: [
                'Start a new interview session and answer each question thoroughly',
                'Explain your thinking and approach, not just a one-word answer',
              ],
              percentile: { percentile: 0, message: 'Insufficient data to determine percentile.' },
            });
            return;
          }

          // ── Content-aware local scoring (no random inflation) ──
          const totalQuestions = conversationTurns.filter(
            (t: any) => t.role === 'interviewer' || t.role === 'assistant' || t.role === 'ai'
          ).length;
          const answeredQuestions = userMsgs.length;
          const coverageRatio = totalQuestions > 0 ? answeredQuestions / totalQuestions : 0;

          // Base score from content depth (0-40 points)
          const avgWordsPerAnswer = totalWords / Math.max(1, answeredQuestions);
          const depthScore = Math.min(40, Math.round(avgWordsPerAnswer * 0.4));

          // Coverage score (0-30 points) — unanswered questions heavily penalized
          const coverageScore = Math.round(coverageRatio * 30);

          // Quality signals (0-30 points)
          const allContent = userMsgs.map((t: any) => (t.content || '').toLowerCase()).join(' ');
          let qualityScore = 0;
          if (allContent.includes('complexity') || allContent.includes('big o') || allContent.includes('o(n)'))
            qualityScore += 8;
          if (allContent.includes('edge case') || allContent.includes('edge cases') || allContent.includes('null'))
            qualityScore += 7;
          if (allContent.includes('```') || allContent.includes('function') || allContent.includes('def '))
            qualityScore += 8;
          if (avgWordsPerAnswer > 60) qualityScore += 7;
          qualityScore = Math.min(30, qualityScore);

          const overallScore = Math.min(100, Math.max(0, depthScore + coverageScore + qualityScore));
          const technicalScore = Math.min(100, Math.max(0, Math.round(overallScore * 0.9)));
          const communicationScore = Math.min(100, Math.max(0, Math.round(
            depthScore + coverageScore + (avgWordsPerAnswer > 30 ? 10 : 0)
          )));

          const fb: Feedback = {
            overall_score: overallScore,
            technical_score: technicalScore,
            communication_score: communicationScore,
            strengths: overallScore >= 50
              ? ['Participated in the interview and attempted answers.']
              : [],
            weaknesses: [
              ...(coverageRatio < 0.5
                ? [`Only answered ${answeredQuestions} of ${totalQuestions} questions — participation was too low for a fair evaluation.`]
                : []),
              ...(avgWordsPerAnswer < 30
                ? ['Answers were too brief — elaborate on your thought process, approach, and trade-offs.']
                : []),
              ...(overallScore < 40
                ? ['Overall performance indicates significant gaps. Review fundamentals before retrying.']
                : []),
            ],
            recommendations: [
              'Start a new interview and answer every question with detailed explanations.',
              'Practice explaining your approach step by step before writing code.',
              ...(s.interview_type === 'dsa'
                ? ['Study Big-O notation and practice Array, HashMap, and Two-pointer problems.']
                : s.interview_type === 'behavioral'
                ? ['Structure every answer using the STAR method (Situation, Task, Action, Result).']
                : ['Cover all system design components: load balancing, caching, databases, monitoring.']),
            ],
          };
          setFeedback(fb);
          if (fb.overall_score >= 70) setTimeout(() => setShowConfetti(true), 600);
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred while analyzing results.');
      } finally {
        setLoading(false);
      }
    }
    loadFeedback();
  }, [sessionId]);

  const radarData = useMemo(() => {
    if (!feedback || !session) return [];
    const t = session.interview_type;
    const o = feedback.overall_score;
    const tech = feedback.technical_score;
    const comm = feedback.communication_score;

    if (t === 'dsa') {
      return [
        { subject: 'Problem Solving', value: tech, fullMark: 100 },
        { subject: 'Code Quality', value: Math.max(0, Math.round(tech * 0.9)), fullMark: 100 },
        { subject: 'Edge Cases', value: Math.max(0, Math.round(o * 0.85)), fullMark: 100 },
        { subject: 'Communication', value: comm, fullMark: 100 },
        { subject: 'Efficiency', value: Math.max(0, Math.round(tech * 0.8)), fullMark: 100 },
      ];
    } else if (t === 'behavioral') {
      return [
        { subject: 'STAR Structure', value: tech, fullMark: 100 },
        { subject: 'Leadership', value: Math.max(0, Math.round(o * 0.9)), fullMark: 100 },
        { subject: 'Communication', value: comm, fullMark: 100 },
        { subject: 'Conciseness', value: Math.max(0, Math.round(o * 0.85)), fullMark: 100 },
        { subject: 'Impact', value: Math.max(0, Math.round(o * 0.95)), fullMark: 100 },
      ];
    }
    return [
      { subject: 'Architecture', value: tech, fullMark: 100 },
      { subject: 'Scalability', value: Math.max(0, Math.round(o * 0.9)), fullMark: 100 },
      { subject: 'Trade-offs', value: Math.max(0, Math.round(o * 0.85)), fullMark: 100 },
      { subject: 'Communication', value: comm, fullMark: 100 },
      { subject: 'Reliability', value: Math.max(0, Math.round(tech * 0.85)), fullMark: 100 },
    ];
  }, [feedback, session]);

  const handleExportPDF = useCallback(async () => {
    if (!feedback || !sessionId) return;
    if (feedback.pdf_url && feedback.pdf_url.startsWith('http')) {
      window.open(feedback.pdf_url, '_blank');
      return;
    }
    setIsExporting(true);
    try {
      const blob = await feedbackApi.downloadPdf(sessionId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DevMeet_Feedback_${sessionId.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      if (feedback.pdf_url) {
        window.open(feedback.pdf_url, '_blank');
        return;
      }
      const typeLabel =
        session?.interview_type === 'dsa'
          ? 'Algorithms & Data Structures'
          : session?.interview_type === 'behavioral'
          ? 'Behavioral (STAR)'
          : 'System Design';

      const scoreColor = (s: number) => (s >= 80 ? '#10b981' : s >= 60 ? '#3b82f6' : '#f59e0b');
      const transcriptRows = turns
        .map(
          (t) => `<tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:10px 14px;font-weight:700;color:${t.role === 'interviewer' ? '#3b82f6' : '#1e293b'};white-space:nowrap;vertical-align:top;">${t.role === 'interviewer' ? 'AI' : 'You'}</td>
            <td style="padding:10px 14px;color:#334155;line-height:1.6;">${t.content}</td>
          </tr>`
        )
        .join('');

      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>DevMeet Feedback Report</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b;padding:32px 24px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.06)}h1{font-size:24px;font-weight:800;color:#0f172a}h2{font-size:14px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px}.scores{display:flex;gap:20px;flex-wrap:wrap;margin:18px 0}.score-box{flex:1;min-width:160px;text-align:center;border-radius:12px;padding:20px 10px;border:1px solid #e2e8f0}.score-val{font-size:36px;font-weight:900}ul{list-style:none;display:flex;flex-direction:column;gap:8px}li{padding:10px 14px;border-radius:8px;font-size:13.5px;line-height:1.5}li.strength{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534}li.weakness{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}li.rec{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:10px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#64748b;background:#f8fafc;border-bottom:2px solid #e2e8f0}.footer{text-align:center;font-size:11px;color:#94a3b8;margin-top:32px}</style></head>
<body><div style="max-width:860px;margin:0 auto">
<div class="card"><h1>DevMeet Interview Report</h1><p style="color:#64748b;font-size:13px;margin-top:6px">Session ID: <strong>${sessionId.slice(0, 8)}</strong> · ${typeLabel}</p></div>
<div class="card"><h2>Performance Scores</h2><div class="scores">
<div class="score-box"><div class="score-val" style="color:${scoreColor(feedback.overall_score)}">${feedback.overall_score}%</div><div style="font-size:11px;color:#94a3b8;margin-top:4px">Overall</div></div>
<div class="score-box"><div class="score-val" style="color:${scoreColor(feedback.technical_score)}">${feedback.technical_score}%</div><div style="font-size:11px;color:#94a3b8;margin-top:4px">Technical</div></div>
<div class="score-box"><div class="score-val" style="color:${scoreColor(feedback.communication_score)}">${feedback.communication_score}%</div><div style="font-size:11px;color:#94a3b8;margin-top:4px">Communication</div></div>
</div></div>
<div class="card"><h2>Strengths</h2><ul>${feedback.strengths.map((s) => `<li class="strength">${s}</li>`).join('')}</ul></div>
<div class="card"><h2>Areas for Improvement</h2><ul>${feedback.weaknesses.map((w) => `<li class="weakness">${w}</li>`).join('')}</ul></div>
<div class="card"><h2>Recommendations</h2><ul>${feedback.recommendations.map((r) => `<li class="rec">${r}</li>`).join('')}</ul></div>
${turns.length > 0 ? `<div class="card"><h2>Transcript</h2><table><thead><tr><th style="width:80px">Speaker</th><th>Message</th></tr></thead><tbody>${transcriptRows}</tbody></table></div>` : ''}
<div class="footer">Generated by DevMeet AI Interview Platform</div>
</div></body></html>`;

      const blobHtml = new Blob([html], { type: 'text/html' });
      const url2 = URL.createObjectURL(blobHtml);
      const link2 = document.createElement('a');
      link2.href = url2;
      link2.download = `DevMeet_Feedback_${session?.interview_type}_${sessionId.slice(0, 8)}.html`;
      document.body.appendChild(link2);
      link2.click();
      document.body.removeChild(link2);
      URL.revokeObjectURL(url2);
    } finally {
      setIsExporting(false);
    }
  }, [session, feedback, turns, sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader size="lg" text="Analyzing Performance (Groq LLM is running evaluation matrix...)" />
      </div>
    );
  }

  if (error || !session || !feedback) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white p-8 rounded-2xl border border-rose-200 max-w-md w-full text-center shadow-lg">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-slate-900 font-bold text-lg mb-2">Analysis Failed</h2>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">{error || 'Could not retrieve feedback report.'}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold w-full">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const scoreColor = (s: number) => (s >= 85 ? '#10b981' : s >= 70 ? '#3b82f6' : s >= 50 ? '#f59e0b' : '#ef4444');
  const gradeLetter =
    feedback.overall_score >= 90 ? 'A+' : feedback.overall_score >= 80 ? 'A' : feedback.overall_score >= 70 ? 'B' : feedback.overall_score >= 60 ? 'C' : 'D';
  const gradeColor =
    feedback.overall_score >= 80 ? 'text-emerald-600' : feedback.overall_score >= 70 ? 'text-blue-600' : feedback.overall_score >= 50 ? 'text-amber-600' : 'text-rose-600';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      {showConfetti && <canvas ref={confettiRef} className="fixed inset-0 z-[200] pointer-events-none" />}

      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm transition-colors font-semibold self-start"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div className="flex gap-2 flex-wrap items-center">
            {usingFallback && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 border border-amber-200 text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5" />
                Local Analytics Mode
              </span>
            )}
            <button
              onClick={() => router.push(`/interview/${sessionId}/replay`)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 text-xs font-bold tracking-wide transition-all shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Replay
            </button>
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-blue-100 hover:bg-blue-50 hover:border-blue-200 text-slate-700 text-xs font-bold tracking-wide transition-all disabled:opacity-60 shadow-sm"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Export Report
                </>
              )}
            </button>
          </div>
        </div>

        {/* Header card */}
        <section className="bg-white border border-blue-100 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center gap-6 justify-between relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-72 h-72 bg-blue-50/50 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-indigo-50/30 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-4 relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
              <Award className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Interview Evaluation</h1>
                <span className="badge-indigo text-[10px] px-2 py-0.5 rounded-full uppercase font-bold">
                  {session.interview_type === 'dsa' ? 'Algorithms' : session.interview_type === 'behavioral' ? 'STAR Behavioral' : 'System Design'}
                </span>
                <span className="text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full text-slate-600 font-semibold capitalize">
                  {session.difficulty}
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-1 font-medium">
                Completed on {new Date(session.completed_at || session.updated_at).toLocaleDateString([], { dateStyle: 'long' })} · Session ID:{' '}
                <span className="font-mono text-slate-400">{sessionId.slice(0, 8)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 relative">
            {feedback.overall_score >= 70 && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl shadow-sm">
                <Trophy className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Grade</p>
                  <p className={`text-xl font-black ${gradeColor}`}>{gradeLetter}</p>
                </div>
              </div>
            )}
            {session.target_company && (
              <div className="bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl text-right shadow-sm">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Targeting</span>
                <span className="text-slate-800 text-sm font-bold">{session.target_company}</span>
              </div>
            )}
          </div>
        </section>

        {/* Scores + Radar */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-white border border-blue-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Target className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-800">Performance Scores</h2>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <ScoreRing score={feedback.overall_score} label="Overall" color={scoreColor(feedback.overall_score)} trackColor="rgba(219,234,254,0.8)" size={128} />
              <ScoreRing score={feedback.technical_score} label="Technical" color="#10b981" trackColor="rgba(209,250,229,0.8)" size={128} />
              <ScoreRing score={feedback.communication_score} label="Communication" color="#0ea5e9" trackColor="rgba(186,230,253,0.8)" size={128} />
            </div>
          </div>
          <div className="lg:col-span-2 bg-white border border-blue-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-slate-800">Skill Breakdown</h2>
            </div>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid strokeOpacity={0.15} />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Score" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.18} strokeWidth={2} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '10px', color: '#f1f5f9', fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`, 'Score']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">No skill data available</div>
            )}
          </div>
        </section>

        {/* Percentile */}
        {feedback.percentile && (
          <section className="bg-gradient-to-r from-indigo-50/80 to-blue-50/60 border border-indigo-200 p-5 rounded-2xl flex items-start gap-3 shadow-sm">
            <TrendingUp className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-indigo-900">
                Peer percentile: top {100 - feedback.percentile.percentile}%
              </h3>
              <p className="text-xs text-indigo-800 mt-1 leading-relaxed">{feedback.percentile.message}</p>
            </div>
          </section>
        )}

        {/* Zero-score getting started guide */}
        {feedback.overall_score === 0 && (
          <section className="bg-amber-50/60 border border-amber-200 p-6 rounded-2xl shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center flex-shrink-0">
                <Brain className="w-5 h-5 text-amber-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-slate-800 font-bold mb-1">Getting Started Guide</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  This session was evaluated as incomplete. Follow these steps to get a proper evaluation next time:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { icon: MessageSquare, title: 'Participate Fully', desc: 'Answer at least 2-3 questions with substantial, detailed responses.' },
                    { icon: Code2, title: 'Show Your Work', desc: 'For DSA: write code. For behavioral: use the STAR framework. For system design: draw diagrams.' },
                    { icon: Users, title: 'Think Out Loud', desc: 'Verbalize your reasoning. The AI evaluates your thought process, not just the final answer.' },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="bg-white/80 border border-amber-100 p-4 rounded-xl">
                      <Icon className="w-4 h-4 text-amber-600 mb-2" />
                      <p className="text-xs font-bold text-slate-800 mb-1">{title}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm shadow-amber-500/20"
                >
                  <RotateCcw className="w-4 h-4" />
                  Start a New Interview
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Strengths / Weaknesses / Recommendations */}
        <FeedbackCards strengths={feedback.strengths} weaknesses={feedback.weaknesses} recommendations={feedback.recommendations} />

        {/* Transcript */}
        {turns.length > 0 && <TranscriptViewer turns={turns} interviewType={session.interview_type} />}

        {/* Bottom nav */}
        <div className="flex justify-center gap-3 pb-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-sm font-semibold rounded-xl transition-all shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm shadow-blue-500/20"
          >
            <Sparkles className="w-4 h-4" />
            Start New Interview
          </button>
        </div>
      </div>
    </div>
  );
}
