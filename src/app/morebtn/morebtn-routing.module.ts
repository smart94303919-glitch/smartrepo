import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MorebtnPage } from './morebtn.page';

const routes: Routes = [
  {
    path: '',
    component: MorebtnPage,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MorebtnPageRoutingModule {}
