import {
  AfterViewInit,
  Component,
  Input,
  OnInit,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { Question, ApiConfiguration, ResponseType } from '../../interfaces/questionnaire.type';
import { FormBuilder, FormGroup } from '@angular/forms';
import { QuestionnaireService } from '../../services/questionnaire.service';
import { DialogComponent } from '../dialog/dialog.component';

@Component({
  selector: 'lib-page-questions-grid',
  templateUrl: './page-questions-grid.component.html',
  styleUrls: ['./page-questions-grid.component.scss'],
})
export class PageQuestionsGridComponent implements OnInit, AfterViewInit {
  @Input({ required: true }) pageQuestions: Array<Question>;
  @Input() isSubmitted: boolean;
  @Input({ required: true }) questionnaireForm: FormGroup;
  @Input() fileUploadResponse;
  @Input() fileSizeLimit;
  @Input() apiConfig: ApiConfiguration;
  @Input() isExpired: boolean;
  @ViewChild('dialogCmp') childDialogComponent: DialogComponent;
  @ViewChild('questionnaire') questionnaire: TemplateRef<any>;

  currentPageIndex = 0;
  enablePagination: boolean = true; // Default to true for backward compatibility
  isDimmed: boolean;

  constructor(public fb: FormBuilder, public qService: QuestionnaireService) {}

  public get reponseType(): typeof ResponseType {
    return ResponseType;
  }

  openDialog(hint: string): void {
    this.isDimmed = !this.isDimmed;
    this.childDialogComponent.hint = hint;
    this.childDialogComponent.hintModalNote =
      'Note: This is the hint for the following question';
    this.childDialogComponent?.openDialog('300ms', '150ms');
  }

  closeHint(): void {
    this.isDimmed = false;
  }

  ngOnInit(): void {
    // Check if pagination is enabled (default to true for backward compatibility)
    this.enablePagination = this.apiConfig?.enablePagination !== false;
   
  }

  ngAfterViewInit(): void {
    // Only enable pagination logic if pagination is enabled
    if (this.enablePagination) {
      setTimeout(() => {
        this.enableRelevantPage();
      });
    }
  }

  enableRelevantPage(questionId?: string): void {
    // Only execute pagination logic if pagination is enabled
    if (!this.enablePagination) {
      return;
    }

    window.scrollTo(0, 0);

    for (let i = 0; i < this.pageQuestions.length; i++) {
      if (i !== this.currentPageIndex) {
        this.domQuery(i, 'none');
      }
    }
    this.domQuery(this.currentPageIndex, 'block', questionId);
  }

  domQuery(elementId: number, action: string, questionId?: string): void {
    if (document.getElementById(`page-group-${elementId}`)) {
      document.getElementById(`page-group-${elementId}`)!.style.display = action;
    }
    if (questionId && document.getElementById(`${questionId}`)) {
      window.setTimeout(() => {
        document.getElementById(`${questionId}`)!.focus();
      }, 500);
    }
  }

  handlePageEvent(e: any): void {
    // Only handle page events if pagination is enabled
    if (!this.enablePagination) {
      return;
    }
    
    this.currentPageIndex = e.pageIndex;
    this.enableRelevantPage(e?.questionId);
  }

  questionTrackBy(index: number, question: Question): string {
    return question._id;
  }

  getSafeApiConfig(data: any): ApiConfiguration {
    // Prevent circular dependency by disabling usePageQuestionsGrid
    // when lib-main is called from page-questions-grid
    return {
      ...this.apiConfig,
      gridCount: data?.columnCount,
      usePageQuestionsGrid: false,
    };
  }
}

