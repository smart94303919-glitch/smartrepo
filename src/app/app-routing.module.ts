import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then( m => m.HomePageModule)
  },
  {
    path: 'mainhome',
    loadChildren: () => import('./mainhome/mainhome.module').then( m => m.MainhomePageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./login/login.module').then( m => m.LoginPageModule)
  },
  {
    path: 'register',
    loadChildren: () => import('./register/register.module').then( m => m.RegisterPageModule)
  },
  {
    path: 'forget',
    loadChildren: () => import('./forget/forget.module').then( m => m.ForgetPageModule)
  },
  {
    path: 'exams',
    loadChildren: () => import('./exams/exams.module').then( m => m.ExamsPageModule)
  },
  {
    path: 'omr',
    loadChildren: () => import('./omr/omr.module').then( m => m.OmrModule)
  },
  {
    path: 'students',
    loadChildren: () => import('./students/students.module').then( m => m.StudentsPageModule)
  },
  {
    path: 'sections',
    loadChildren: () => import('./sections/sections.module').then( m => m.SectionsModule)
  },
  {
    path: 'student_dashboard',
    loadChildren: () => import('./student_dashboard/student_dashboard.module').then( m => m.StudentDashboardModule)
  },
  {
    path: 'archive',
    loadComponent: () => import('./archive/archive.page').then(m => m.ArchivePage)
  },
  {
    path: 'student-info',
    loadComponent: () => import('./student_info/student-info.page').then(m => m.StudentInfoPage)
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
  path: 'studentreg',
  loadComponent: () => import('./studentreg/studentreg.page').then(c => c.StudentregPage)
},
  {
  path: 'studentsection',
  loadComponent: () => import('./studentsection').then(c => c.StudentsectionComponent)
},
  {
    path: 'cictp',
    loadChildren: () => import('./cictp/cictp.module').then( m => m.CictpPageModule)
  },
  {
    path: 'coedp',
    loadChildren: () => import('./coedp/coedp.module').then( m => m.CoedpPageModule)
  },
  {
    path: 'cmbtp',
    loadChildren: () => import('./cmbtp/cmbtp.module').then( m => m.CmbtpPageModule)
  },
  {
    path: 'cictfirst',
    loadChildren: () => import('./cictfirst/cictfirst.module').then( m => m.CictfirstPageModule)
  },
  {
    path: 'cictsecond',
    loadChildren: () => import('./cictsecond/cictsecond.module').then( m => m.CictsecondPageModule)
  },
  {
    path: 'sec-a',
    loadChildren: () => import('./sec-a/sec-a.module').then( m => m.SecAPageModule)
  },
  {
    path: 'sec-b',
    loadChildren: () => import('./sec-b/sec-b.module').then( m => m.SecBPageModule)
  },
  {
    path: 'sec-c',
    loadChildren: () => import('./sec-c/sec-c.module').then( m => m.SecCPageModule)
  },
  {
    path: 'sec-d',
    loadChildren: () => import('./sec-d/sec-d.module').then( m => m.SecDPageModule)
  },
  {
    path: 'sec-e',
    loadChildren: () => import('./sec-e/sec-e.module').then( m => m.SecEPageModule)
  },
  {
    path: 'morebtn',
    loadChildren: () => import('./morebtn/morebtn.module').then( m => m.MorebtnPageModule)
  },
  {
    path: 'about-and-use',
    loadComponent: () => import('./about_and_use/about-and-use.page').then( m => m.AboutAndUsePage)
  },
  {
    path: 'cictthird',
    loadChildren: () => import('./cictthird/cictthird.module').then( m => m.CictthirdPageModule)
  },
  {
    path: 'cictfourth',
    loadChildren: () => import('./cictfourth/cictfourth.module').then( m => m.CictfourthPageModule)
  },
  {
    path: 'searchstud',
    loadChildren: () => import('./searchstud/searchstud.module').then( m => m.SearchstudPageModule)
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      preloadingStrategy: PreloadAllModules,
      useHash: true
    })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
