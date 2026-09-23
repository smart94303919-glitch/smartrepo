import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';


@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  // ✅ Updated table names
  private professorTable = 'professor_tbl';
  private studentTable = 'student';
  private professorLoginTable = 'professor_login';
  private departmentTable = 'department';
  private professorDepartmentAssignmentTable = 'prof_assignment';
  private studentDepartmentTable = 'stud_dept';
  private yearTable = 'year';
  private sectionTable = 'section_tbl';
  private profSubjectAssignmentTable = 'prof_subject_assignment_tbl';
  private professorSectionSubjectTable = 'prof_section_subj';
  private professorSubjectSectionAssignmentTable = this.professorSectionSubjectTable;
  private professorSubjectSectionStudentAssignmentTable = 'prof_subject_section_student_assignment';
  private subjectTable = 'subject_tbl';
  private studentCodeTable = 'student_code';
  private studentSubjectSectionAssignmentTable = 'student_subject_section_assignment';
  private studentCodeAssignmentTable = 'student_code_assignment';

  async getStudentById(studentId: string): Promise<{
    student_id: string;
    firstname: string;
    lastname: string;
    middlename: string | null;
  } | null> {
    const { data, error } = await this.supabase
      .from('student')
      .select('student_id, firstname, lastname, middlename')
      .eq('student_id', studentId)
      .maybeSingle();

    if (error) return null;
    return data;
  }

  private async attachStudentToSection(studentId: string, sectionName: string): Promise<number | null> {
    const normalizedSection = sectionName?.trim();
    if (!normalizedSection) {
      return null;
    }

    const { data: sectionRow, error: sectionError } = await this.supabase
      .from(this.sectionTable)
      .upsert([{ section: normalizedSection }], { onConflict: 'section' })
      .select('section_id')
      .single();

    if (sectionError || !sectionRow?.section_id) {
      return null;
    }

    const { error } = await this.supabase
      .from('student_section_assignment')
      .insert([{ student_id: studentId, section_id: sectionRow.section_id }]);

    if (!error) {
      return sectionRow.section_id;
    }

    return sectionRow.section_id;
  }

  private async getProfessorDepartmentId(profId: number): Promise<number | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.professorDepartmentAssignmentTable)
        .select('dept_id')
        .eq('prof_id', profId)
        .not('dept_id', 'is', null)
        .order('assignment_id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching professor department:', error);
        return null;
      }

      return data?.dept_id ?? null;
    } catch (error: any) {
      console.error('Error fetching professor department:', error);
      return null;
    }
  }

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          lock: async (_name, _acquireTimeout, fn) => await fn()
        }
      }
    );
  }




  // ---------------- PROFESSOR METHODS ----------------

  async registerProfessor(professorData: any) {
    try {
      const pLogValue = professorData.p_log || professorData.email;

      const profileData = {
        first_name: professorData.first_name,
        middle_name: professorData.middle_name,
        last_name: professorData.last_name,
        p_log: pLogValue
      };

      const { data: profData, error: profError } = await this.supabase
        .from(this.professorTable)
        .insert([profileData])
        .select()
        .single();

      if (profError) throw new Error(profError.message);

      const loginData = {
        prof_id: profData.prof_id,
        email: professorData.email,
        password: professorData.password
      };

      const { data: loginDataResult, error: loginError } = await this.supabase
        .from(this.professorLoginTable)
        .insert([loginData])
        .select()
        .single();

      if (loginError) throw new Error(loginError.message);

      return { success: true, data: { profile: profData, login: loginDataResult } };
    } catch (error: any) {
      console.error('Error registering professor:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  async checkProfessorIdExists(professorId: string) {
    try {
      const { data, error } = await this.supabase
        .from(this.professorTable)
        .select('p_log')
        .eq('p_log', professorId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking professor ID:', error);
      return false;
    }
  }

  async validateLogin(loginData: { prof_number: string; password: string }) {
    try {
      const profNumber = loginData.prof_number?.trim();
      const password = loginData.password?.trim();

      if (!profNumber || !password) {
        return { success: false, error: 'Please enter both prof_number and password', data: [] };
      }

      const { data: loginRecord, error: loginError } = await this.supabase
        .from(this.professorLoginTable)
        .select('login_id, prof_id, prof_number, password')
        .eq('prof_number', profNumber)
        .eq('password', password)
        .maybeSingle();

      if (loginError) {
        console.error('Error fetching professor login credentials:', loginError);
        return { success: false, error: 'Unable to validate credentials', data: [] };
      }

      if (!loginRecord) {
        return { success: false, error: 'Invalid credentials', data: [] };
      }

      const { data: profRecord, error: profError } = await this.supabase
        .from('professor_tbl')
        .select('prof_id, p_firstname, p_middlename, p_lastname')
        .eq('prof_id', loginRecord.prof_id)
        .maybeSingle();

      if (profError || !profRecord) {
        console.error('Error fetching professor profile:', profError);
        return { success: false, error: 'Unable to load professor profile', data: [] };
      }

      return {
        success: true,
        user: {
          ...profRecord,
          prof_number: loginRecord.prof_number
        },
        data: [profRecord]
      };
    } catch (error: any) {
      console.error('Error validating login:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  async getProfessorDetails(profId: number): Promise<{
    fullName: string;
    professorNumber: string;
    email: string;
  }> {
    const [profileResult, loginResult] = await Promise.all([
      this.supabase
        .from(this.professorTable)
        .select('p_firstname, p_middlename, p_lastname')
        .eq('prof_id', profId)
        .maybeSingle(),
      this.supabase
        .from(this.professorLoginTable)
        .select('prof_number, email')
        .eq('prof_id', profId)
        .maybeSingle()
    ]);

    if (profileResult.error) throw profileResult.error;
    if (loginResult.error) throw loginResult.error;
    if (!profileResult.data || !loginResult.data) {
      throw new Error('Professor record was not found.');
    }

    return {
      fullName: [
        profileResult.data.p_firstname,
        profileResult.data.p_middlename,
        profileResult.data.p_lastname
      ].filter(Boolean).join(' '),
      professorNumber: String(loginResult.data.prof_number ?? 'N/A'),
      email: loginResult.data.email ?? 'N/A'
    };
  }

  async getProfessorSchoolYear(profId: number): Promise<string> {
    const { data, error } = await this.supabase
      .from(this.professorDepartmentAssignmentTable)
      .select('assignment_id, schoolyear_tbl(*)')
      .eq('prof_id', profId)
      .not('sy_id', 'is', null)
      .order('assignment_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const schoolYear = Array.isArray(data?.schoolyear_tbl)
      ? data.schoolyear_tbl[0]
      : data?.schoolyear_tbl;

    return String(
      schoolYear?.sy_label ??
      schoolYear?.school_year ??
      schoolYear?.schoolyear ??
      schoolYear?.school_year_name ??
      schoolYear?.sy_name ??
      'N/A'
    );
  }

async getProfessorSubjectSectionAssignments(profId: number) {
  const { data: assignments, error: assignmentError } = await this.supabase
    .from(this.professorSectionSubjectTable)
    .select('prof_id, section_id, subj_id')
    .eq('prof_id', profId);

  if (assignmentError) {
    console.error('Error fetching professor subject section assignments:', assignmentError);
    throw assignmentError;
  }

  const validAssignments = (assignments || []).filter((assignment: any) =>
    assignment.section_id !== null && assignment.subj_id !== null
  );
  if (!validAssignments.length) {
    return [];
  }

  const sectionIds = Array.from(new Set(validAssignments.map((assignment: any) => Number(assignment.section_id))));
  const subjectIds = Array.from(new Set(validAssignments.map((assignment: any) => Number(assignment.subj_id))));
  const [sectionsResult, subjectsResult] = await Promise.all([
    this.supabase
      .from(this.sectionTable)
      .select('section_id, section')
      .in('section_id', sectionIds),
    this.supabase
      .from(this.subjectTable)
      .select('subj_id, subject')
      .in('subj_id', subjectIds)
  ]);

  if (sectionsResult.error) {
    throw sectionsResult.error;
  }
  if (subjectsResult.error) {
    throw subjectsResult.error;
  }

  const sectionMap = new Map((sectionsResult.data || []).map((section: any) => [
    Number(section.section_id),
    section
  ]));
  const subjectMap = new Map((subjectsResult.data || []).map((subject: any) => [
    Number(subject.subj_id),
    subject
  ]));

  return validAssignments.map((assignment: any) => ({
    ...assignment,
    section_tbl: sectionMap.get(Number(assignment.section_id)) ?? null,
    subject_tbl: subjectMap.get(Number(assignment.subj_id)) ?? null
  }));
}

async getProfessorSubjectsForSection(profId: number, sectionId: number): Promise<Array<{ id: number; name: string }>> {
  const { data: assignments, error: assignmentError } = await this.supabase
    .from(this.professorSectionSubjectTable)
    .select('subj_id')
    .eq('prof_id', Number(profId))
    .eq('section_id', Number(sectionId));

  if (assignmentError) {
    throw assignmentError;
  }

  const subjectIds = Array.from(new Set((assignments || [])
    .map((assignment: any) => Number(assignment.subj_id))
    .filter((subjectId: number) => Number.isFinite(subjectId))));

  if (!subjectIds.length) {
    return [];
  }

  const { data: subjects, error: subjectError } = await this.supabase
    .from(this.subjectTable)
    .select('subj_id, subject')
    .in('subj_id', subjectIds);

  if (subjectError) {
    throw subjectError;
  }

  return (subjects || []).map((subject: any) => ({
    id: Number(subject.subj_id),
    name: subject.subject
  }));
}

async getProfessorStudentScores(profId: number): Promise<any[]> {
  const assignments = await this.getProfessorSubjectSectionAssignments(profId);
  const ownedSheetIds = await this.getProfessorSheetIds(profId);
  if (!ownedSheetIds.length) {
    return [];
  }
  const assignmentKeys = new Set(
    (assignments || []).map((assignment: any) => `${assignment.subj_id}:${assignment.section_id}`)
  );

  if (!assignmentKeys.size) {
    return [];
  }

  const { data: scoreRows, error: scoreError } = await this.supabase
    .from('student_score')
    .select('student_id, sheet_id, score_value, percentage, subj_id, section_id');

  if (scoreError) {
    throw scoreError;
  }

  const visibleScores = (scoreRows || []).filter((score: any) =>
    ownedSheetIds.includes(String(score.sheet_id ?? '').trim()) &&
    assignmentKeys.has(`${score.subj_id}:${score.section_id}`)
  );

  if (!visibleScores.length) {
    return [];
  }

  const studentIds = Array.from(new Set(visibleScores.map((score: any) => score.student_id)));
  const { data: students, error: studentError } = await this.supabase
    .from('student_tbl')
    .select('student_id, s_firstname, s_middlename, s_lastname')
    .in('student_id', studentIds);

  if (studentError) {
    throw studentError;
  }

  const studentMap = new Map((students || []).map((student: any) => [
    String(student.student_id),
    [student.s_firstname, student.s_middlename, student.s_lastname].filter(Boolean).join(' ')
  ]));
  const subjectMap = new Map<number, string>();
  const sectionMap = new Map<number, string>();
  (assignments || []).forEach((assignment: any) => {
    const subject = Array.isArray(assignment.subject_tbl) ? assignment.subject_tbl[0] : assignment.subject_tbl;
    const section = Array.isArray(assignment.section_tbl) ? assignment.section_tbl[0] : assignment.section_tbl;
    subjectMap.set(Number(assignment.subj_id), subject?.subject ?? 'Unknown Subject');
    sectionMap.set(Number(assignment.section_id), section?.section ?? 'Unknown Section');
  });

  return visibleScores.map((score: any) => ({
    ...score,
    student_name: studentMap.get(String(score.student_id)) ?? 'Unknown Student',
    subject_name: subjectMap.get(Number(score.subj_id)) ?? 'Unknown Subject',
    section_name: sectionMap.get(Number(score.section_id)) ?? 'Unknown Section'
  }));
}

async getProfessorGradeAssessments(profId: number): Promise<any[]> {
  const assignments = await this.getProfessorSubjectSectionAssignments(profId);
  const assignmentKeys = new Set(
    (assignments || []).map((assignment: any) => `${assignment.subj_id}:${assignment.section_id}`)
  );

  if (!assignmentKeys.size) {
    return [];
  }

  const { data: ownedSheets, error: ownershipError } = await this.supabase
    .from('sheet_prof')
    .select('sheet_id')
    .eq('prof_id', Number(profId));

  if (ownershipError) {
    throw ownershipError;
  }

  const ownedSheetIds = Array.from(new Set(
    (ownedSheets || [])
      .map((sheet: any) => String(sheet.sheet_id ?? '').trim())
      .filter(Boolean)
  ));
  if (!ownedSheetIds.length) {
    return [];
  }

  const { data, error } = await this.supabase
    .from('sheet_tbl')
    .select('sheet_id, sheet_title, quiz_type, section_id, subj_id')
    .in('sheet_id', ownedSheetIds);

  if (error) {
    throw error;
  }

  const subjectNames = new Map<number, string>();
  const sectionNames = new Map<number, string>();
  (assignments || []).forEach((assignment: any) => {
    const subject = Array.isArray(assignment.subject_tbl) ? assignment.subject_tbl[0] : assignment.subject_tbl;
    const section = Array.isArray(assignment.section_tbl) ? assignment.section_tbl[0] : assignment.section_tbl;
    subjectNames.set(Number(assignment.subj_id), subject?.subject ?? 'Unknown Subject');
    sectionNames.set(Number(assignment.section_id), section?.section ?? 'Unknown Section');
  });

  return (data || [])
    .filter((sheet: any) => assignmentKeys.has(`${sheet.subj_id}:${sheet.section_id}`))
    .map((sheet: any) => ({
      ...sheet,
      subject_name: subjectNames.get(Number(sheet.subj_id)) ?? 'Unknown Subject',
      section_name: sectionNames.get(Number(sheet.section_id)) ?? 'Unknown Section'
    }));
}

async getProfessorGradesForAssessment(
  profId: number,
  sectionId: number,
  subjectId: number,
  sheetId: string
): Promise<any[]> {
  const assignments = await this.getProfessorSubjectSectionAssignments(profId);
  const isAssigned = (assignments || []).some((assignment: any) =>
    Number(assignment.section_id) === Number(sectionId) && Number(assignment.subj_id) === Number(subjectId)
  );

  if (!isAssigned) {
    return [];
  }

  const ownedSheetIds = await this.getProfessorSheetIds(profId);
  if (!ownedSheetIds.includes(String(sheetId).trim())) {
    return [];
  }

  const { data: scoreRows, error: scoreError } = await this.supabase
    .from('student_score')
    .select('student_id, sheet_id, score_value, percentage, subj_id, section_id')
    .eq('sheet_id', sheetId)
    .eq('subj_id', Number(subjectId))
    .eq('section_id', Number(sectionId));

  if (scoreError) {
    throw scoreError;
  }

  if (!scoreRows?.length) {
    return [];
  }

  const studentIds = Array.from(new Set(scoreRows.map((score: any) => score.student_id)));
  const { data: students, error: studentError } = await this.supabase
    .from('student_tbl')
    .select('student_id, s_firstname, s_middlename, s_lastname')
    .in('student_id', studentIds);

  if (studentError) {
    throw studentError;
  }

  const studentMap = new Map((students || []).map((student: any) => [
    String(student.student_id),
    [student.s_firstname, student.s_middlename, student.s_lastname].filter(Boolean).join(' ')
  ]));

  return scoreRows.map((score: any) => ({
    ...score,
    student_name: studentMap.get(String(score.student_id)) ?? 'Unknown Student'
  }));
}

async getSheetAssignments(sheetIds: string[]): Promise<any[]> {
  const normalizedSheetIds = Array.from(new Set(
    sheetIds.map((sheetId) => String(sheetId ?? '').trim()).filter(Boolean)
  ));

  if (!normalizedSheetIds.length) {
    return [];
  }

  const { data, error } = await this.supabase
    .from('sheet_assignment')
    .select('assignment_id, sheet_id, dept_id, sy_id')
    .in('sheet_id', normalizedSheetIds)
    .order('assignment_id', { ascending: false });

  if (error) {
    console.error('Error fetching sheet assignments:', error);
    throw error;
  }

  return data || [];
}

async getProfessorSheetIds(profId: number): Promise<string[]> {
  const { data, error } = await this.supabase
    .from('sheet_prof')
    .select('sheet_id')
    .eq('prof_id', Number(profId));

  if (error) {
    throw error;
  }

  return Array.from(new Set((data || [])
    .map((row: any) => String(row.sheet_id ?? '').trim())
    .filter(Boolean)));
}

async sheetIdExists(sheetId: string): Promise<boolean> {
  const { data, error } = await this.supabase
    .from('sheet_tbl')
    .select('sheet_id')
    .eq('sheet_id', sheetId.trim())
    .limit(1);

  if (error) {
    throw error;
  }

  return Boolean(data?.length);
}

async professorOwnsSheet(profId: number, sheetId: string): Promise<boolean> {
  const { data, error } = await this.supabase
    .from('sheet_prof')
    .select('assignment_id')
    .eq('prof_id', Number(profId))
    .eq('sheet_id', sheetId.trim())
    .limit(1);

  if (error) {
    throw error;
  }

  return Boolean(data?.length);
}

async archiveStudents(studentIds: string[], subjectId: number | number[], sectionName?: string | null, profId?: number): Promise<boolean> {
  const normalizedIds = Array.from(new Set(studentIds.map((id) => id.trim()).filter(Boolean)));
  const normalizedSubjectIds = Array.from(new Set((Array.isArray(subjectId) ? subjectId : [subjectId])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)));

  if (!normalizedIds.length || !normalizedSubjectIds.length || !sectionName?.trim()) {
    throw new Error('Student, subject, and section are required to archive students.');
  }

  const { data: section, error: sectionError } = await this.supabase
    .from(this.sectionTable)
    .select('section_id')
    .ilike('section', sectionName.trim())
    .maybeSingle();

  if (sectionError) {
    throw sectionError;
  }

  if (!section?.section_id) {
    throw new Error('Section could not be found.');
  }

  const { data: professorAssignment, error: professorAssignmentError } = await this.supabase
    .from(this.professorDepartmentAssignmentTable)
    .select('sy_id')
    .eq('prof_id', Number(profId))
    .not('sy_id', 'is', null)
    .order('assignment_id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (professorAssignmentError) {
    throw professorAssignmentError;
  }

  if (!professorAssignment?.sy_id) {
    throw new Error('Professor school year assignment was not found.');
  }

  const { data: scores, error: scoreError } = await this.supabase
    .from('student_score')
    .select('student_id, subj_id, "Score_id"')
    .in('student_id', normalizedIds)
    .in('subj_id', normalizedSubjectIds)
    .eq('section_id', Number(section.section_id));

  if (scoreError) {
    throw scoreError;
  }

  const { data: departments, error: departmentError } = await this.supabase
    .from(this.studentDepartmentTable)
    .select('student_id, dept_id')
    .in('student_id', normalizedIds);

  if (departmentError) {
    throw departmentError;
  }

  const departmentByStudent = new Map(
    (departments || []).map((department: any) => [String(department.student_id), department.dept_id])
  );

  const scoreRowsByStudentSubject = new Map<string, any[]>();
  (scores || []).forEach((score: any) => {
    const key = `${score.student_id}:${score.subj_id}`;
    const studentScores = scoreRowsByStudentSubject.get(key) || [];
    studentScores.push(score);
    scoreRowsByStudentSubject.set(key, studentScores);
  });

  const archiveRows: any[] = [];
  normalizedIds.forEach((studentId) => {
    normalizedSubjectIds.forEach((selectedSubjectId) => {
      const studentScores = scoreRowsByStudentSubject.get(`${studentId}:${selectedSubjectId}`) || [];
      (studentScores.length ? studentScores : [{ 'Score_id': null }]).forEach((score) => {
        const departmentId = departmentByStudent.get(studentId);
        const scoreId = score['Score_id'];
        archiveRows.push({
          student_id: String(studentId),
          sy_id: Number(professorAssignment.sy_id),
          dept_id: departmentId !== null && departmentId !== undefined && Number.isFinite(Number(departmentId))
            ? Number(departmentId)
            : null,
          section_id: Number(section.section_id),
          subj_id: Number(selectedSubjectId),
          'Score_id': scoreId !== null && scoreId !== undefined && Number.isFinite(Number(scoreId))
            ? Number(scoreId)
            : null
        });
      });
    });
  });

  const { error: archiveError } = await this.supabase
    .from('s_archive')
    .insert(archiveRows);

  if (archiveError) {
    console.error('s_archive insert error:', archiveError);
    throw archiveError;
  }

  const studentAssignmentDelete = this.supabase
    .from('stud_section_subj')
    .delete()
    .in('student_id', normalizedIds)
    .in('subj_id', normalizedSubjectIds)
    .eq('section_id', Number(section.section_id));
  const { error: studentAssignmentError } = await studentAssignmentDelete;

  if (studentAssignmentError) {
    throw studentAssignmentError;
  }

  return true;
}

async getArchivedStudents(): Promise<any[]> {
  const { data, error } = await this.supabase
    .from('s_archive')
    .select('*, student_tbl(*), department(*), section_tbl(*), subject_tbl(*), schoolyear_tbl(*), student_score(*)')
    .order('archive_id', { ascending: false });

  if (error) {
    throw error;
  }

  const archiveRows = data || [];
  const studentIds = Array.from(new Set(archiveRows.map((row: any) => row.student_id).filter(Boolean)));
  if (!studentIds.length) {
    return archiveRows;
  }

  const { data: departments, error: departmentError } = await this.supabase
    .from(this.studentDepartmentTable)
    .select('student_id, dept_id')
    .in('student_id', studentIds);

  if (departmentError) {
    throw departmentError;
  }

  const departmentByStudent = new Map(
    (departments || []).map((department: any) => [String(department.student_id), department.dept_id])
  );

  return archiveRows.map((row: any) => ({
    ...row,
    dept_id: row.dept_id ?? departmentByStudent.get(String(row.student_id)) ?? null
  }));
}

async restoreArchivedStudent(archiveRow: any, profId: number): Promise<void> {
  const studentId = String(archiveRow?.student_id ?? '').trim();
  const sectionId = Number(archiveRow?.section_id);
  const subjectId = Number(archiveRow?.subj_id);
  const archiveId = Number(archiveRow?.archive_id);

  if (!studentId || !Number.isFinite(sectionId) || !Number.isFinite(subjectId) || !Number.isFinite(archiveId)) {
    throw new Error('Archive record is incomplete.');
  }

  const { data: enrollment, error: enrollmentLookupError } = await this.supabase
    .from('stud_section_subj')
    .select('student_id')
    .eq('student_id', studentId)
    .eq('section_id', sectionId)
    .eq('subj_id', subjectId)
    .maybeSingle();

  if (enrollmentLookupError) {
    throw enrollmentLookupError;
  }

  if (!enrollment) {
    const { error } = await this.supabase
      .from('stud_section_subj')
      .insert({ student_id: studentId, section_id: sectionId, subj_id: subjectId });
    if (error) throw error;
  }

  const { data: professorStudent, error: professorStudentLookupError } = await this.supabase
    .from('prof_stud')
    .select('student_id')
    .eq('student_id', studentId)
    .eq('prof_id', profId)
    .maybeSingle();

  if (professorStudentLookupError) {
    throw professorStudentLookupError;
  }

  if (!professorStudent) {
    const { error } = await this.supabase
      .from('prof_stud')
      .insert({ student_id: studentId, prof_id: profId });
    if (error) throw error;
  }

  const { error: archiveDeleteError } = await this.supabase
    .from('s_archive')
    .delete()
    .eq('archive_id', archiveId);

  if (archiveDeleteError) {
    throw archiveDeleteError;
  }
}

async getProfessorAssignedSubjects(profId: number) {
  const { data, error } = await this.supabase
    .from(this.profSubjectAssignmentTable)
    .select('SubjectID, subject(SubjectID, subject)')
    .eq('prof_id', profId);

  if (error) {
    console.error('Error fetching professor assigned subjects:', error);
    throw error;
  }

  return data;
}

async getSubjectSectionAssignments(subjectIds: number[]) {
  if (!subjectIds.length) {
    return [];
  }

  const { data, error } = await this.supabase
    .from('subject_section_assignment_tbl')
    .select('SubjectID, section_id, section(section_id, section)')
    .in('SubjectID', subjectIds);

  if (error) {
    console.error('Error fetching subject section assignments:', error);
    throw error;
  }

  return data;
}

async getProfessorAssignedSection(profId: number) {
  const { data, error } = await this.supabase
    .from('prof_section_assignment_tbl')
    .select('section_id, section(section_id, section)')
    .eq('prof_id', profId)
    .single();

  if (error) {
    console.error('Error fetching professor assigned section:', error);
    throw error;
  }
  return data;
}

async getProfessorAssignedSections(profId: number) {
  const { data, error } = await this.supabase
    .from(this.professorSectionSubjectTable)
    .select('section_id, section_tbl(section_id, section)')
    .eq('prof_id', profId);

  if (error) {
    console.error('Error fetching professor assigned sections:', error);
    throw error;
  }

  const sections = (data || [])
    .map((item: any) => item.section_tbl)
    .filter(Boolean)
    .filter((section: any, index: number, self: any[]) =>
      self.findIndex((item) => item.section_id === section.section_id) === index
    );

  return sections;
}

async getProfessorAssignedSubjectsForSection(profId: number, sectionId: number): Promise<Array<{ SubjectID: number; subject: string }>> {
  const { data, error } = await this.supabase
    .from(this.professorSectionSubjectTable)
    .select('subj_id, subject_tbl(subj_id, subject)')
    .eq('prof_id', profId)
    .eq('section_id', sectionId);

  if (error) {
    console.error('Error fetching professor subjects for section:', error);
    throw error;
  }

  return (data || [])
    .map((assignment: any) => ({
      SubjectID: Number(assignment.subj_id ?? assignment.subject_tbl?.subj_id),
      subject: assignment.subject_tbl?.subject,
    }))
    .filter((subject): subject is { SubjectID: number; subject: string } =>
      Number.isFinite(subject.SubjectID) && Boolean(subject.subject)
    )
    .filter((subject, index, subjects) =>
      subjects.findIndex((item) => item.SubjectID === subject.SubjectID) === index
    );
}

async saveSheetMetadata(metadata: {
  sheet_id: string;
  sheet_title: string;
  quiz_type: string;
  questions: number;
  columns: number;
  section_id: number;
  subj_id: number;
}, profId?: number | null): Promise<void> {
  const { error } = await this.supabase
    .from('sheet_tbl')
    .upsert([metadata], { onConflict: 'sheet_id' });

  if (error) {
    console.error('Error saving sheet metadata:', error);
    throw error;
  }

  const activeProfessorId = Number(profId);
  if (!Number.isFinite(activeProfessorId) || activeProfessorId <= 0) {
    console.warn('Sheet metadata saved without a valid professor ID; sheet_prof link skipped.');
    return;
  }

  const { data: existingMapping, error: mappingLookupError } = await this.supabase
    .from('sheet_prof')
    .select('assignment_id')
    .eq('sheet_id', metadata.sheet_id.trim())
    .eq('prof_id', activeProfessorId)
    .limit(1);

  if (mappingLookupError) {
    throw mappingLookupError;
  }

  if (!existingMapping?.length) {
    const { error: mappingInsertError } = await this.supabase
      .from('sheet_prof')
      .insert({ sheet_id: metadata.sheet_id.trim(), prof_id: activeProfessorId });

    if (mappingInsertError) {
      throw mappingInsertError;
    }
  }
}

async saveAnswerKey(
  sheetId: string,
  profId: number,
  answerKey: Record<string, string | null>,
): Promise<void> {
  const normalizedSheetId = String(sheetId ?? '').trim();
  const normalizedProfId = Number(profId);
  if (!normalizedSheetId || !Number.isFinite(normalizedProfId) || normalizedProfId <= 0) {
    throw new Error('A valid sheet ID and professor ID are required to save the answer key.');
  }

  const { error } = await this.supabase
    .from('sheet_anskey')
    .upsert({
      sheet_id: normalizedSheetId,
      prof_id: normalizedProfId,
      answer_key: answerKey,
    }, { onConflict: 'sheet_id,prof_id' });

  if (error) {
    throw error;
  }
}

async getAnswerKey(sheetId: string, profId: number): Promise<Record<string, string | null> | null> {
  const { data, error } = await this.supabase
    .from('sheet_anskey')
    .select('answer_key')
    .eq('sheet_id', String(sheetId ?? '').trim())
    .eq('prof_id', Number(profId))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.answer_key ?? null;
}

async assignSheetToProfessor(sheetId: string, profId: number): Promise<void> {
  const { data: professorAssignment, error: assignmentError } = await this.supabase
    .from(this.professorDepartmentAssignmentTable)
    .select('assignment_id, dept_id, sy_id')
    .eq('prof_id', profId)
    .not('dept_id', 'is', null)
    .not('sy_id', 'is', null)
    .order('assignment_id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assignmentError) {
    throw assignmentError;
  }

  if (!professorAssignment?.dept_id || !professorAssignment?.sy_id) {
    throw new Error('Professor department and school year assignment was not found.');
  }

  const { error: sheetAssignmentError } = await this.supabase
    .from('sheet_assignment')
    .insert([{
      sheet_id: sheetId,
      dept_id: professorAssignment.dept_id,
      sy_id: professorAssignment.sy_id
    }]);

  if (sheetAssignmentError) {
    console.error('Error assigning generated sheet:', sheetAssignmentError);
    throw sheetAssignmentError;
  }
}

async getAssignedStudentIds(profId: number, sectionId: number, subjectId: number): Promise<string[]> {
  const [professorStudents, sectionSubjectStudents] = await Promise.all([
    this.supabase
      .from('prof_stud')
      .select('student_id')
      .eq('prof_id', profId),
    this.supabase
      .from('stud_section_subj')
      .select('student_id')
      .eq('section_id', sectionId)
      .eq('subj_id', subjectId)
  ]);

  if (professorStudents.error || sectionSubjectStudents.error) {
    const error = professorStudents.error ?? sectionSubjectStudents.error;
    console.error('Error fetching assigned students for answer sheets:', error);
    throw error;
  }

  const professorStudentIds = new Set(
    (professorStudents.data || [])
      .map((assignment: any) => String(assignment.student_id ?? '').trim())
      .filter(Boolean)
  );

  return Array.from(new Set(
    (sectionSubjectStudents.data || [])
      .map((assignment: any) => String(assignment.student_id ?? '').trim())
      .filter((studentId: string) => studentId && professorStudentIds.has(studentId))
  ));
}

async getStudentMetadata(studentIds: string[]): Promise<Array<{ student_id: string; student_name: string }>> {
  const ids = Array.from(new Set(studentIds.map((studentId) => String(studentId).trim()).filter(Boolean)));
  if (!ids.length) {
    return [];
  }

  const { data, error } = await this.supabase
    .from('student_tbl')
    .select('student_id, s_firstname, s_middlename, s_lastname')
    .in('student_id', ids);

  if (error) {
    throw error;
  }

  return (data || []).map((student: any) => ({
    student_id: String(student.student_id).trim(),
    student_name: [student.s_firstname, student.s_middlename, student.s_lastname]
      .filter((namePart) => namePart != null && String(namePart).trim())
      .map((namePart) => String(namePart).trim())
      .join(' '),
  }));
}



//////////////////////////////

  // ---------------- STUDENT METHODS ----------------
async registerStudentsBatch(studentDataList: any[]): Promise<{
  success: boolean;
  data: Array<{ student_id: string }>;
  error?: string;
}> {
  const studentIds = studentDataList
    .map((studentData) => String(studentData.student_id ?? '').trim())
    .filter(Boolean);

  if (!studentDataList.length || studentIds.length !== studentDataList.length) {
    return { success: false, data: [], error: 'Every imported student must have a student ID.' };
  }

  const uniqueStudentIds = Array.from(new Set(studentIds));
  if (uniqueStudentIds.length !== studentIds.length) {
    return { success: false, data: [], error: 'Imported student IDs must be unique.' };
  }

  const professorId = studentDataList[0]?.professorId ?? studentDataList[0]?.profId ?? this.getCurrentProfessorIdFromStorage();
  const normalizedProfessorId = professorId !== null && professorId !== undefined && professorId !== ''
    ? Number(professorId)
    : null;

  if (normalizedProfessorId === null || !Number.isFinite(normalizedProfessorId)) {
    return { success: false, data: [], error: 'Active school year not set for professor.' };
  }

  const existingStudentIdSet = new Set<string>();

  try {
    const { data: professorAssignment, error: assignmentError } = await this.supabase
      .from(this.professorDepartmentAssignmentTable)
      .select('sy_id')
      .eq('prof_id', normalizedProfessorId)
      .not('sy_id', 'is', null)
      .order('assignment_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignmentError) throw assignmentError;
    const currentProfessorSyId = professorAssignment?.sy_id ?? null;
    if (currentProfessorSyId === null || currentProfessorSyId === undefined) {
      return { success: false, data: [], error: 'Active school year not set for professor.' };
    }

    const { data: existingStudents, error: existingStudentsError } = await this.supabase
      .from('student_tbl')
      .select('student_id')
      .in('student_id', uniqueStudentIds);

    if (existingStudentsError) throw existingStudentsError;
    (existingStudents ?? []).forEach((student) => existingStudentIdSet.add(String(student.student_id).trim()));
    const studentPayloads = studentDataList.map((studentData, index) => ({
      student_id: studentIds[index],
      s_firstname: studentData.first_name ?? studentData.firstname ?? studentData.s_firstname ?? '',
      s_middlename: studentData.middle_name ?? studentData.middlename ?? studentData.s_middlename ?? null,
      s_lastname: studentData.last_name ?? studentData.lastname ?? studentData.s_lastname ?? '',
      age: studentData.age !== '' && studentData.age !== null && studentData.age !== undefined ? Number(studentData.age) : null,
      gender: studentData.gender ?? null
    }));

    const { data: savedStudents, error: studentUpsertError } = await this.supabase
      .from('student_tbl')
      .upsert(studentPayloads, { onConflict: 'student_id' })
      .select('student_id');

    if (studentUpsertError) throw studentUpsertError;
    const savedStudentIds = (savedStudents ?? []).map((student) => String(student.student_id).trim());
    if (savedStudentIds.length !== uniqueStudentIds.length) {
      throw new Error('Some imported student records could not be saved.');
    }

    const { data: existingSchoolYearAssignments, error: schoolYearLookupError } = await this.supabase
      .from('stud_sy')
      .select('student_id')
      .in('student_id', uniqueStudentIds)
      .eq('sy_id', currentProfessorSyId);

    if (schoolYearLookupError) throw schoolYearLookupError;
    const assignedStudentIds = new Set((existingSchoolYearAssignments ?? []).map((assignment) => String(assignment.student_id).trim()));
    const newSchoolYearAssignments = uniqueStudentIds
      .filter((studentId) => !assignedStudentIds.has(studentId))
      .map((studentId) => ({ student_id: studentId, sy_id: currentProfessorSyId }));

    if (newSchoolYearAssignments.length) {
      const { error: schoolYearInsertError } = await this.supabase
        .from('stud_sy')
        .insert(newSchoolYearAssignments);

      if (schoolYearInsertError) throw schoolYearInsertError;
    }

    for (const studentData of studentDataList) {
      const result = await this.registerStudent({ ...studentData, professorId: normalizedProfessorId });
      if (!result.success) {
        throw new Error(result.error || 'Student registration failed.');
      }
    }

    return { success: true, data: savedStudents ?? [] };
  } catch (error: any) {
    const rollbackIds = studentIds.filter((studentId) => !existingStudentIdSet.has(studentId));
    if (rollbackIds.length) {
      await this.supabase.from('stud_section_subj').delete().in('student_id', rollbackIds);
      await this.supabase.from('stud_dept').delete().in('student_id', rollbackIds);
      await this.supabase.from('prof_stud').delete().in('student_id', rollbackIds);
      await this.supabase.from('stud_sy').delete().in('student_id', rollbackIds);
      await this.supabase.from('student_tbl').delete().in('student_id', rollbackIds);
    }

    console.error('Error registering students in bulk:', error);
    return { success: false, data: [], error: error?.message || 'Bulk student registration failed.' };
  }
}

async registerStudent(studentData: any): Promise<{
  success: boolean;
  data: any[];
  studentCode?: string;
  error?: string;
}> {
  try {
    const studentId = (studentData.student_id ?? '').toString().trim();
    if (!studentId) {
      return { success: false, error: 'Student ID is required.', data: [] };
    }

    const professorId = studentData.professorId ?? studentData.profId ?? this.getCurrentProfessorIdFromStorage();
    const normalizedProfessorId = professorId !== null && professorId !== undefined && professorId !== ''
      ? Number(professorId)
      : null;

    if (normalizedProfessorId === null || !Number.isFinite(normalizedProfessorId)) {
      return { success: false, error: 'Active school year not set for professor.', data: [] };
    }

    const { data: professorAssignment, error: assignmentError } = await this.supabase
      .from(this.professorDepartmentAssignmentTable)
      .select('sy_id')
      .eq('prof_id', normalizedProfessorId)
      .not('sy_id', 'is', null)
      .order('assignment_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignmentError) throw assignmentError;

    const currentProfessorSyId = professorAssignment?.sy_id ?? null;
    if (currentProfessorSyId === null || currentProfessorSyId === undefined) {
      return { success: false, error: 'Active school year not set for professor.', data: [] };
    }

    if (studentData.age !== undefined && studentData.age !== null && studentData.age !== '') {
      const ageValue = Number(studentData.age);
      if (ageValue < 18 || ageValue > 120) {
        return { success: false, error: 'Invalid age. Must be between 18 and 120.', data: [] };
      }
    }

    const studentPayload = {
      student_id: studentId,
      s_firstname: studentData.first_name ?? studentData.firstname ?? studentData.s_firstname ?? '',
      s_middlename: studentData.middle_name ?? studentData.middlename ?? studentData.s_middlename ?? null,
      s_lastname: studentData.last_name ?? studentData.lastname ?? studentData.s_lastname ?? '',
      age: studentData.age !== '' && studentData.age !== null && studentData.age !== undefined ? Number(studentData.age) : null,
      gender: studentData.gender ?? null
    };

    const { data: existingStudent, error: studentCheckError } = await this.supabase
      .from('student_tbl')
      .select('student_id')
      .eq('student_id', studentId)
      .maybeSingle();

    if (studentCheckError) throw studentCheckError;

    let studentRow: { student_id: string };
    if (existingStudent) {
      const { data: updatedStudent, error: studentUpdateError } = await this.supabase
        .from('student_tbl')
        .update(studentPayload)
        .eq('student_id', studentId)
        .select('student_id')
        .single();

      if (studentUpdateError) throw studentUpdateError;
      studentRow = updatedStudent;
    } else {
      const { data: insertedStudent, error: studentInsertError } = await this.supabase
        .from('student_tbl')
        .insert([studentPayload])
        .select('student_id')
        .single();

      if (studentInsertError) throw studentInsertError;
      studentRow = insertedStudent;
    }

    if (normalizedProfessorId !== null) {
      const { data: existingProfessorStudent, error: professorStudentCheckError } = await this.supabase
        .from('prof_stud')
        .select('prof_id, student_id')
        .eq('prof_id', normalizedProfessorId)
        .eq('student_id', studentRow.student_id)
        .maybeSingle();

      if (professorStudentCheckError) throw professorStudentCheckError;
      if (!existingProfessorStudent) {
        const { error: professorStudentInsertError } = await this.supabase
          .from('prof_stud')
          .insert([{ prof_id: normalizedProfessorId, student_id: studentRow.student_id }]);

        if (professorStudentInsertError) throw professorStudentInsertError;
      }

      const departmentId = await this.getProfessorDepartmentId(Number(professorId));
      if (departmentId !== null) {
        const { data: existingStudentDepartment, error: studentDepartmentCheckError } = await this.supabase
          .from(this.studentDepartmentTable)
          .select('student_id, dept_id')
          .eq('student_id', studentRow.student_id)
          .eq('dept_id', departmentId)
          .maybeSingle();

        if (studentDepartmentCheckError) throw studentDepartmentCheckError;
        if (!existingStudentDepartment) {
          const { error: studentDepartmentInsertError } = await this.supabase
            .from(this.studentDepartmentTable)
            .insert([{ student_id: studentRow.student_id, dept_id: departmentId }]);

          if (studentDepartmentInsertError) throw studentDepartmentInsertError;
        }
      }
    }

    const { data: existingStudentSchoolYear, error: studentSchoolYearCheckError } = await this.supabase
      .from('stud_sy')
      .select('assignment_id')
      .eq('student_id', studentRow.student_id)
      .eq('sy_id', currentProfessorSyId)
      .maybeSingle();

    if (studentSchoolYearCheckError) throw studentSchoolYearCheckError;
    if (!existingStudentSchoolYear) {
      const { error: studentSchoolYearInsertError } = await this.supabase
        .from('stud_sy')
        .insert([{
          student_id: studentRow.student_id,
          sy_id: currentProfessorSyId
        }]);

      if (studentSchoolYearInsertError) throw studentSchoolYearInsertError;
    }

    const sectionName = studentData.section?.toString().trim();
    const subjectId = studentData.subjectId ?? studentData.subj_id ?? studentData.SubjectID ?? null;
    const normalizedSubjectId = subjectId !== null && subjectId !== undefined && subjectId !== '' ? Number(subjectId) : null;
    const importedSectionId = studentData.section_id !== undefined && studentData.section_id !== null && studentData.section_id !== ''
      ? Number(studentData.section_id)
      : null;

    if (normalizedSubjectId !== null && Number.isFinite(normalizedSubjectId)) {
      let sectionId = Number.isFinite(importedSectionId) ? importedSectionId : null;

      if (sectionId === null && sectionName) {
        const { data: sectionRow, error: sectionError } = await this.supabase
          .from('section_tbl')
          .select('section_id')
          .eq('section', sectionName)
          .maybeSingle();

        if (sectionError) throw sectionError;
        sectionId = sectionRow?.section_id ? Number(sectionRow.section_id) : null;
      }

      if (sectionId !== null && Number.isFinite(sectionId)) {
        const { data: existingEnrollment, error: enrollmentCheckError } = await this.supabase
          .from('stud_section_subj')
          .select('student_id, section_id, subj_id')
          .eq('student_id', studentRow.student_id)
          .eq('section_id', sectionId)
          .eq('subj_id', normalizedSubjectId)
          .maybeSingle();

        if (enrollmentCheckError) throw enrollmentCheckError;
        if (!existingEnrollment) {
          const { error: enrollmentInsertError } = await this.supabase
            .from('stud_section_subj')
            .insert([{
              student_id: studentRow.student_id,
              section_id: sectionId,
              subj_id: normalizedSubjectId,
            }]);

          if (enrollmentInsertError) throw enrollmentInsertError;
        }
      }
    }

    return { success: true, data: [studentRow] };

  } catch (error: any) {
    const rowError = `Student ${studentData.student_id ?? 'unknown'}: ${error.message}`;
    console.error('Error registering student:', error);
    return { success: false, error: rowError, data: [] };
  }
}

async removeStudentFromSubjectSectionAssignment(studentId: string, subjectId: number, sectionName?: string | null, profId?: number): Promise<boolean> {
  try {
    const normalizedStudentId = studentId?.toString().trim();
    const normalizedSubjectId = Number(subjectId);
    const normalizedSectionName = sectionName?.trim();
    if (!normalizedStudentId || !Number.isFinite(normalizedSubjectId) || !normalizedSectionName) {
      return false;
    }

    const { data: section, error: sectionError } = await this.supabase
      .from(this.sectionTable)
      .select('section_id')
      .ilike('section', normalizedSectionName)
      .maybeSingle();

    if (sectionError) {
      throw sectionError;
    }

    if (!section?.section_id) {
      throw new Error('Section could not be found.');
    }

    const { error: assignmentError } = await this.supabase
      .from('stud_section_subj')
      .delete()
      .eq('student_id', normalizedStudentId)
      .eq('section_id', Number(section.section_id))
      .eq('subj_id', normalizedSubjectId);

    if (assignmentError) {
      throw assignmentError;
    }

    return true;
  } catch (error: any) {
    console.error('Error removing student from subject section assignment:', error);
    return false;
  }
}

async getStudentsForSubject(subjectId: number, sectionName?: string | null, profId?: number): Promise<any[]> {
  try {
    const normalizedSectionName = sectionName?.trim();
    if (!subjectId || !normalizedSectionName || profId === undefined || profId === null) {
      return [];
    }

    const sectionResult = await this.supabase
      .from(this.sectionTable)
      .select('section_id, section')
      .ilike('section', normalizedSectionName)
      .maybeSingle();

    if (sectionResult.error && sectionResult.error.code !== 'PGRST116') {
      console.warn('Section lookup failed during dashboard student load:', sectionResult.error);
    }

    const sectionId = Number(sectionResult.data?.section_id ?? 0);
    if (!sectionResult.data?.section_id || !Number.isFinite(sectionId)) {
      return [];
    }

    const professorStudentResult = await this.supabase
      .from('prof_stud')
      .select('student_id')
      .eq('prof_id', profId);

    if (professorStudentResult.error) {
      console.warn('Professor-student lookup failed during dashboard student load:', professorStudentResult.error);
      return [];
    }

    const professorStudentIds = new Set((professorStudentResult.data || [])
      .map((item: any) => String(item.student_id ?? '').trim())
      .filter(Boolean));

    if (!professorStudentIds.size) {
      return [];
    }

    const enrollmentResult = await this.supabase
      .from('stud_section_subj')
      .select('student_id')
      .eq('section_id', sectionId)
      .eq('subj_id', Number(subjectId));

    if (enrollmentResult.error) {
      console.warn('Enrollment lookup failed during dashboard student load:', enrollmentResult.error);
      return [];
    }

    const studentIds = Array.from(new Set((enrollmentResult.data || [])
      .map((item: any) => String(item.student_id ?? '').trim())
      .filter((id: string) => Boolean(id) && professorStudentIds.has(id))));

    if (!studentIds.length) {
      return [];
    }

    const studentResult = await this.supabase
      .from('student_tbl')
      .select('student_id, s_firstname, s_middlename, s_lastname, age, gender')
      .in('student_id', studentIds);

    if (studentResult.error) {
      console.warn('Student lookup failed during dashboard student load:', studentResult.error);
      return [];
    }

    return (studentResult.data || []).map((student: any) => ({
      student_id: student.student_id,
      first_name: student.s_firstname,
      middle_name: student.s_middlename,
      last_name: student.s_lastname,
      age: student.age,
      gender: student.gender,
      studentCode: null,
      subjectName: null,
      sectionName: normalizedSectionName,
      department: null,
      year: null
    }));
  } catch (error: any) {
    console.error('Error fetching students for section subject:', error);
    return [];
  }
}

async updateStudent(studentIdentifier: string | number, updates: any) {
  const normalizedId = studentIdentifier.toString().trim();
  const originalStudentId = (updates.originalStudentId ?? normalizedId).toString().trim();

  if (updates.age !== undefined && updates.age !== null && updates.age !== '') {
    const ageValue = Number(updates.age);
    if (ageValue < 18 || ageValue > 120) {
      return { error: { message: 'Invalid age. Must be between 18 and 120.' } };
    }
  }

  const updatePayload = {
    student_id: normalizedId,
    s_firstname: updates.first_name ?? null,
    s_middlename: updates.middle_name ?? null,
    s_lastname: updates.last_name ?? null,
    age: updates.age ?? null,
    gender: updates.gender ?? null
  };

  if (originalStudentId !== normalizedId) {
    const { data: existingNewId, error: newIdLookupError } = await this.supabase
      .from('student_tbl')
      .select('student_id')
      .eq('student_id', normalizedId)
      .maybeSingle();

    if (newIdLookupError) return { error: newIdLookupError };
    if (existingNewId) return { error: { message: 'The new student ID is already in use.' } };

    const { data: originalStudent, error: originalStudentError } = await this.supabase
      .from('student_tbl')
      .select('student_id, s_firstname, s_middlename, s_lastname, age, gender')
      .eq('student_id', originalStudentId)
      .maybeSingle();

    if (originalStudentError) return { error: originalStudentError };
    if (!originalStudent) return { error: { message: 'Student record was not found.' } };

    const { error: newStudentError } = await this.supabase
      .from('student_tbl')
      .insert({ ...originalStudent, ...updatePayload });

    if (newStudentError) return { error: newStudentError };

    const linkedTables = ['student_score', 'p_archive', 'prof_stud', 'stud_section_subj'];
    for (const table of linkedTables) {
      const { error } = await this.supabase
        .from(table)
        .update({ student_id: normalizedId })
        .eq('student_id', originalStudentId);

      if (error) {
        await this.supabase.from('student_tbl').delete().eq('student_id', normalizedId);
        return { error };
      }
    }

    const { error: oldStudentDeleteError } = await this.supabase
      .from('student_tbl')
      .delete()
      .eq('student_id', originalStudentId);

    if (oldStudentDeleteError) return { error: oldStudentDeleteError };
  } else {
    const { error: studentError } = await this.supabase
      .from('student_tbl')
      .update(updatePayload)
      .eq('student_id', originalStudentId);

    if (studentError) return { error: studentError };
  }

  const { data: savedStudent, error: savedStudentError } = await this.supabase
    .from('student_tbl')
    .select('student_id')
    .eq('student_id', normalizedId)
    .maybeSingle();

  if (savedStudentError) return { error: savedStudentError };
  if (!savedStudent?.student_id) {
    return { error: { message: 'Student record was not found.' } };
  }

  const sectionName = updates.section?.toString().trim();
  const subjectId = updates.subjectId ?? updates.subj_id ?? updates.SubjectID ?? null;
  const subjectIds = (updates.subjectIds ?? [subjectId])
    .map((value: number | string | null) => Number(value))
    .filter((value: number) => Number.isFinite(value));
  const professorId = updates.professorId ?? updates.profId ?? this.getCurrentProfessorIdFromStorage();

  const { error: enrollmentDeleteError } = await this.supabase
      .from('stud_section_subj')
      .delete()
      .eq('student_id', savedStudent.student_id);

  if (enrollmentDeleteError) return { error: enrollmentDeleteError };

  if (!subjectIds.length) {
    return { error: null };
  }

  const importedSectionId = updates.section_id !== undefined && updates.section_id !== null && updates.section_id !== ''
    ? Number(updates.section_id)
    : null;
  let sectionId = Number.isFinite(importedSectionId) ? importedSectionId : null;

  if (sectionId === null && sectionName) {
    const { data: sectionRow, error: sectionError } = await this.supabase
      .from('section_tbl')
      .select('section_id')
      .eq('section', sectionName)
      .limit(1)
      .maybeSingle();

    if (sectionError) return { error: sectionError };
    sectionId = sectionRow?.section_id ? Number(sectionRow.section_id) : null;
  }

  if (sectionId === null || !Number.isFinite(sectionId)) {
    return { error: { message: 'Selected section was not found.' } };
  }

  if (professorId !== null && professorId !== undefined && Number.isFinite(Number(professorId))) {
    const { data: professorStudentRow, error: professorStudentLookupError } = await this.supabase
      .from('prof_stud')
      .select('student_id')
      .eq('prof_id', Number(professorId))
      .eq('student_id', savedStudent.student_id)
      .limit(1)
      .maybeSingle();

    if (professorStudentLookupError) return { error: professorStudentLookupError };

    if (!professorStudentRow) {
      const { error: professorStudentInsertError } = await this.supabase
        .from('prof_stud')
        .insert([{ prof_id: Number(professorId), student_id: savedStudent.student_id }]);

      if (professorStudentInsertError) return { error: professorStudentInsertError };
    }
  }

  const { error: enrollmentInsertError } = await this.supabase
    .from('stud_section_subj')
    .insert(subjectIds.map((selectedSubjectId: number) => ({
      student_id: savedStudent.student_id,
      section_id: sectionId,
      subj_id: selectedSubjectId
    })));

  if (enrollmentInsertError) return { error: enrollmentInsertError };

  return { error: null };
}

private getCurrentProfessorIdFromStorage(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const currentUser = localStorage.getItem('currentUser');
  if (!currentUser) {
    return null;
  }

  const user = JSON.parse(currentUser);
  return user?.prof_id ?? null;
}


async deleteStudent(studentId: string | number) {
  const normalizedStudentId = studentId?.toString().trim();

  if (!normalizedStudentId) {
    return { error: { message: 'Student ID is required.' } };
  }

  const { error: sectionAssignmentError } = await this.supabase
    .from('student_section_assignment')
    .delete()
    .eq('student_id', normalizedStudentId);

  if (sectionAssignmentError) return { error: sectionAssignmentError };

  const { error: subjectAssignmentError } = await this.supabase
    .from(this.studentSubjectSectionAssignmentTable)
    .delete()
    .eq('student_id', normalizedStudentId);

  if (subjectAssignmentError) return { error: subjectAssignmentError };

  const { error: profSubjectAssignmentError } = await this.supabase
    .from(this.professorSubjectSectionAssignmentTable)
    .delete()
    .eq('student_id', normalizedStudentId);

  if (profSubjectAssignmentError) return { error: profSubjectAssignmentError };

  const { error: profSubjectSectionStudentAssignmentError } = await this.supabase
    .from(this.professorSubjectSectionStudentAssignmentTable)
    .delete()
    .eq('student_id', normalizedStudentId);

  if (profSubjectSectionStudentAssignmentError) return { error: profSubjectSectionStudentAssignmentError };

  const { error: departmentAssignmentError } = await this.supabase
    .from(this.studentDepartmentTable)
    .delete()
    .eq('student_id', normalizedStudentId);

  if (departmentAssignmentError) return { error: departmentAssignmentError };

  return await this.supabase.from(this.studentTable).delete().eq('student_id', normalizedStudentId);
}



async getAllStudents() {
  return await this.supabase
    .from('student')
    .select(`
      student_id,
      studinfo_id,
      first_name,
      last_name,
      age,
      gender,
      student_department (
        department:department (
          department
        )
      ),
      student_year_assignment (
        year:year (
          year
        )
      ),
      student_section_assignment (
        section:section (
          section
        )
      )
    `);
}

async getStudentsBySectionIds(sectionIds: number[]) {
  if (!sectionIds.length) {
    return [];
  }

  const { data, error } = await this.supabase
    .from('student_section_assignment')
    .select(`
      section_id,
      student (
        studinfo_id,
        first_name,
        middle_name,
        last_name,
        age,
        gender
      ),
      section (
        section_id,
        section
      )
    `)
    .in('section_id', sectionIds);

  if (error) {
    console.error('Error fetching students by section:', error);
    throw error;
  }

  return data;
}

async getAllSections() {
  const { data, error } = await this.supabase
    .from(this.sectionTable)
    .select('section_id, section')
    .order('section', { ascending: true });

  if (error) {
    console.error('Error fetching sections:', error);
    throw error;
  }

  return data;
}

async getSubjectsByProfessorSection(profId: number | null, sectionId: number | null) {
  if (!profId || !sectionId) {
    return [];
  }

  const { data, error } = await this.supabase
    .from(this.professorSectionSubjectTable)
    .select('subj_id, subject_tbl(subj_id, subject)')
    .eq('prof_id', profId)
    .eq('section_id', sectionId);

  if (error) {
    console.error('Error fetching professor subjects by section:', error);
    throw error;
  }

  const subjects = (data || [])
    .map((assignment: any) => ({
      SubjectID: Number(assignment.subj_id ?? assignment.subject_tbl?.subj_id),
      subject: assignment.subject_tbl?.subject,
    }))
    .filter((subject): subject is { SubjectID: number; subject: string } =>
      Number.isFinite(subject.SubjectID) && Boolean(subject.subject)
    )
    .filter((subject, index, list) =>
      list.findIndex((item) => item.SubjectID === subject.SubjectID) === index
    );

  return subjects;
}

}
