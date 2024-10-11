import { booleanAttribute, Component, Input, OnInit, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import * as urlConfig from '../../constants/url-config.json';
import * as testReport from '../../constants/respose-report.json';
import { MatDialog } from '@angular/material/dialog';
import { ToastService } from '../../services/toast.service';
import { catchError } from 'rxjs';
import { ApiConfiguration } from '../../interfaces/questionnaire.type';

@Component({
  selector: 'lib-report',
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.css']
})
export class ReportComponent implements OnInit {
  reportDetails!: any;
  objectURL: any;
  objectType!: string;
  isModalOpen: boolean = false;
  isFilterModalOpen: boolean = false;
  filteredQuestions: any[] = [];
  allQuestions: any[] = [];
  surveyName!: string;
  objectKeys = Object.keys;
  submissionId: any;
  @Input() apiConfig: ApiConfiguration;
  @Input({ transform: booleanAttribute }) angular = false;
  resultData = false;
  totalSubmissions:any;
  observationId:any;

  constructor(
    private router: Router,
    public apiService: ApiService,
    // private activatedRoute: ActivatedRoute, 
    public toaster: ToastService
  ) { }

  ngOnInit() {
    // console.log("this.submissionId")


    // this.submissionId = "66f297a59e0e301dadc4d042";
    // this.setApiService();
    // if (this.submissionId) {
    //   this.loadSurveyReport(this.submissionId);
    // }
    // this.activatedRoute.params.subscribe(param => {
    //   this.submissionId = param['id'];
    // this.apiService.post(urlConfig.survey.reportUrl + this.submissionId, {})
    //   .subscribe((res: any) => {
    //     this.surveyName = res.message.surveyName;
    //     this.allQuestions = res.message.report;
    //     this.reportDetails = this.processSurveyData(res.message.report);
    //   });
    // });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      this.angular &&
      changes['apiConfig']
    ) {
      this.setApiService();
      console.log("this.submissionId")


      this.submissionId = "66e03d1cbe48d96e6842d25d";
      this.setApiService();
      if (this.submissionId) {
        this.loadSurveyReport(this.submissionId);
      }
    }
  }

  setApiService() {
    this.apiService.baseUrl = this.apiConfig.baseURL;
    this.apiService.token = this.apiConfig.userAuthToken;
    this.apiService.solutionType = this.apiConfig.solutionType;
  }

  loadSurveyReport(submissionId: string) {
    console.log("loadSurveyReport", submissionId);
    console.log("urlConfig.survey.reportUrl", urlConfig.survey.reportUrl);

    let payload = {
        "submissionId": submissionId,
        "observation": true,
        "entityType": "school",
        "pdf": false,
        "criteriaWise": false
    };

    this.apiService.post(urlConfig.survey.reportUrl, payload)
        .pipe(
            catchError((err) => {
                console.log("error", err);
                throw new Error('Could not fetch the details');
            })
        )
        .subscribe((res: any) => {
            console.log("res", res);
            this.resultData = res?.result?.result;
            this.surveyName = res?.result?.solutionName;
            this.totalSubmissions = res?.result?.totalSubmissions;
            this.observationId = res?.result?.observationId;
            this.allQuestions = res?.result?.reportSections;
            this.reportDetails = this.processSurveyData(res?.result?.reportSections);
        });
}

processSurveyData(data: any[]): any[] {
  const mapAnswersToLabels = (answers: any[], options: any[]) => {
      return answers.map((answer: any) => {
          // Check if the answer is a string before calling trim
          if (typeof answer === 'string') {
              const trimmedAnswer = answer.trim();
              if (trimmedAnswer === '') {
                  return 'No response is available';
              }

              const option = options?.find((opt: { value: any }) => opt.value === trimmedAnswer);
              return option ? option.label : trimmedAnswer;
          } 
          // If the answer is not a string, return it as is
          return answer;
      });
  };

  const processInstanceQuestions = (instance: any) => {
      const processedInstance = { ...instance };
      for (const key in processedInstance) {
          if (key !== 'instanceIdentifier') {
              processedInstance[key].answers = mapAnswersToLabels(
                  processedInstance[key].answers,
                  processedInstance[key].options
              );
              delete processedInstance[key].options;
          }
      }
      return processedInstance;
  };

  return data.map((question) => {
      if (question.responseType === 'matrix' && question.instanceQuestions) {
          const processedInstanceQuestions = question.instanceQuestions.map(processInstanceQuestions);
          return { ...question, instanceQuestions: processedInstanceQuestions };
      } else {
          const processedQuestion = { ...question };
          processedQuestion.answers = mapAnswersToLabels(question.answers, question.options);
          delete processedQuestion.options;
          return processedQuestion;
      }
  });
}



  openDialog(url: string, type: string) {
    this.objectURL = url;
    this.objectType = type;
    this.isModalOpen = true;
  }

  closeDialog() {
    this.isModalOpen = false;
  }

  openFilter() {
    this.isFilterModalOpen = true;
  }

  closeFilter() {
    this.isFilterModalOpen = false;
  }

  updateFilteredQuestions() {
    this.filteredQuestions = this.allQuestions.filter(question => question.selected);
  }

  checkAnswerValue(answer: any): string | number {
    if (typeof answer === 'string') {
      return answer.trim() === '' ? 'NA' : answer;
    }
    return answer;
  }

  applyFilter(reset: boolean = false) {
    this.updateFilteredQuestions();

    const questionsToProcess = this.filteredQuestions.length > 0 ? this.filteredQuestions : this.allQuestions;
    this.reportDetails = this.processSurveyData(questionsToProcess);

    if (!reset && this.filteredQuestions.length === 0) {
      this.toaster.showToast('Select at least one question', 'danger');
    }

    if (reset || this.filteredQuestions.length > 0) {
      this.closeFilter();
    }
  }

  resetFilter() {
    this.allQuestions.forEach(question => question.selected = false);
    this.filteredQuestions = [];
    this.applyFilter(true);
  }

  goBack() {
    this.router.navigate(['/previous-page']); // Update with the correct route
  }

  openUrl(url: string) {
    window.open(url, '_blank');
  }
}