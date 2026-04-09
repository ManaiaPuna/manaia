// api/studio-project.js
// GET  ?userId=xxx        — list projects for rights holder
// POST { project, userId } — create new project

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── LIST PROJECTS (GET) ───────────────────────────
  if (req.method === 'GET') {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const { data, error } = await supabase
      .from('projects')
      .select('*, kt_members(*), crew_members(*)')
      .eq('rights_holder_id', userId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ projects: data });
  }

  // ── CREATE PROJECT (POST) ─────────────────────────
  if (req.method === 'POST') {
    const { project, userId } = req.body;
    if (!project || !userId) return res.status(400).json({ error: 'project and userId required' });

    // Insert project
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .insert({
        rights_holder_id: userId,
        title: project.title,
        type: project.type,
        description: project.description,
        rh_name: project.rhName,
        rh_pct: project.rhPct,
        kt_pct: project.ktPct,
        crew_pct: project.crewPct,
        locked: false
      })
      .select()
      .single();

    if (projErr) return res.status(500).json({ error: projErr.message });

    // Insert Key Team members
    if (project.ktMembers?.length > 0) {
      await supabase.from('members').insert(
        project.ktMembers.map(m => ({
          project_id: proj.id,
          pool: 'key_team',
          name: m.name,
          role: m.role,
          email: m.email || null,
          pct: m.pct,
          status: 'pending'
        }))
      );
    }

    // Insert Crew members
    if (project.crewMembers?.length > 0) {
      await supabase.from('members').insert(
        project.crewMembers.map(m => ({
          project_id: proj.id,
          pool: 'crew',
          name: m.name,
          role: m.role,
          email: m.email || null,
          pct: m.pct,
          status: 'pending'
        }))
      );
    }

    return res.json({ project: proj });
  }

  // ── LOCK PROJECT (PATCH) ──────────────────────────
  if (req.method === 'PATCH') {
    const { projectId, userId, action } = req.body;
    if (!projectId || !userId) return res.status(400).json({ error: 'projectId and userId required' });

    if (action === 'lock') {
      const { error } = await supabase
        .from('projects')
        .update({ locked: true })
        .eq('id', projectId)
        .eq('rights_holder_id', userId);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    // Add member
    if (action === 'add_member') {
      const { member } = req.body;
      const { data: proj } = await supabase
        .from('projects')
        .select('locked, kt_pct, crew_pct')
        .eq('id', projectId)
        .single();

      if (proj?.locked) return res.status(403).json({ error: 'Project is locked' });

      // Recalculate even split for the pool
      const { data: existingMembers } = await supabase
        .from('members')
        .select('id')
        .eq('project_id', projectId)
        .eq('pool', member.pool);

      const poolPct = member.pool === 'key_team' ? proj.kt_pct : proj.crew_pct;
      const newCount = (existingMembers?.length || 0) + 1;
      const evenShare = +(poolPct / newCount).toFixed(2);

      // Update existing members' pct
      await supabase
        .from('members')
        .update({ pct: evenShare })
        .eq('project_id', projectId)
        .eq('pool', member.pool);

      // Insert new member
      await supabase.from('members').insert({
        project_id: projectId,
        pool: member.pool,
        name: member.name,
        role: member.role,
        email: member.email || null,
        pct: evenShare,
        status: 'pending'
      });

      return res.json({ ok: true, pct: evenShare });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
